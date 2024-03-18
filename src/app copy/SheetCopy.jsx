import styles from './styles.module.css';
import React, { useRef, useEffect, useState, useMemo } from 'react';
import useResizeObserver from 'use-resize-observer';

function resizeCanvas(canvas) {
    const { width, height } = canvas.getBoundingClientRect();
    let { devicePixelRatio: ratio = 1 } = window;
    if (ratio < 1) {
        ratio = 1;
    }
    const newCanvasWidth = Math.round(width * ratio);
    const newCanvasHeight = Math.round(height * ratio);

    if (canvas.width !== newCanvasWidth || canvas.height !== newCanvasHeight) {
        const context = canvas.getContext('2d');
        canvas.width = newCanvasWidth;
        canvas.height = newCanvasHeight;
        context.scale(ratio, ratio);
        return true;
    }

    return false;
}

function createRowOrColumnPropFunction(sizeProp, defaultValue) {
    return (cell) => {
        if (Array.isArray(sizeProp)) {
            if (cell >= 0 && cell < sizeProp.length) {
                return sizeProp[cell];
            } else {
                return defaultValue;
            }
        } else if (typeof sizeProp === 'function') {
            return sizeProp(cell);
        } else if (typeof sizeProp === 'number') {
            return sizeProp;
        } else {
            return defaultValue;
        }
    };
}

function createCellPropFunction(cellProp, defaultValue) {
    return (x, y) => {
        if (Array.isArray(cellProp)) {
            if (y >= 0 && y < cellProp.length) {
                if (x >= 0 && x < cellProp[y].length) {
                    return cellProp[y][x];
                } else {
                    return defaultValue;
                }
            } else {
                return defaultValue;
            }
        } else if (typeof cellProp === 'function') {
            return cellProp(x, y);
        } else if (cellProp !== null && cellProp !== undefined) {
            return cellProp;
        } else {
            return defaultValue;
        }
    };
}

function drawCell(context, cellContent, style, defaultCellStyle, xCoord, yCoord, cellWidth, cellHeight) {
    style.color = style.color || defaultCellStyle.color;
    style.fontSize = style.fontSize || defaultCellStyle.fontSize;
    style.fontFamily = style.fontFamily || defaultCellStyle.fontFamily;
    style.textAlign = style.textAlign || defaultCellStyle.textAlign;
    style.marginRight = style.marginRight || defaultCellStyle.marginRight;
    style.marginLeft = style.marginLeft || defaultCellStyle.marginLeft;
    style.weight = style.weight || defaultCellStyle.weight;

    context.fillStyle = style.color;
    context.font = style.weight + style.fontSize + 'px ' + style.fontFamily;
    context.textAlign = style.textAlign;

    const adjustment = style.textAlign === 'right' ? cellWidth - style.marginRight : style.marginLeft;
    const xx = xCoord + adjustment;
    const yy = yCoord + cellHeight * 0.5;

    context.save();
    context.beginPath();
    context.rect(xCoord, yCoord, cellWidth, cellHeight);
    context.clip();

    if (style.backgroundColor) {
        context.fillStyle = style.backgroundColor;
        context.fillRect(xCoord, yCoord, cellWidth, cellHeight);
        context.fillStyle = style.color;
    }

    if (Array.isArray(cellContent)) {
        for (const obj of cellContent) {
            if (obj.content instanceof HTMLImageElement) {
                context.drawImage(obj.content, xCoord + obj.x, yy + obj.y, obj.width, obj.height);
            } else if (typeof obj.content === 'string') {
                context.fillText(obj.content, xCoord + obj.x, yy + obj.y);
            }
        }
    } else {
        context.fillText(cellContent, xx, yy);
    }
    context.restore();
}

function calculateRowsOrColsSizes(freezeCount, size, startingSize, startingIndex, visibleArea) {
    const visible = [];
    const start = [];
    const end = [];
    let prev = 0;

    start.push(startingSize);
    visible.push(freezeCount > 0 ? 0 : startingIndex);
    let firstSize = freezeCount > 0 ? size(0) : size(startingIndex);
    prev = startingSize + firstSize;
    end.push(prev);

    let ind = freezeCount > 0 ? 1 : startingIndex + 1;

    if (freezeCount > 0) {
        for (; ind < freezeCount; ind++) {
            visible.push(ind);
            start.push(prev);
            prev = prev + size(ind);
            end.push(prev);
        }
        ind = Math.max(startingIndex, freezeCount);
    }

    while (true) {
        visible.push(ind);
        start.push(prev);
        prev = prev + size(ind);
        end.push(prev);
        if (end[end.length - 1] >= visibleArea) {
            break;
        }
        ind++;
    }
    return {
        visible,
        start,
        end,
    };
}

function Sheet(props) {
    const canvasRef = useRef(null);
    const overlayRef = useRef(null);
    const copyPasteTextAreaRef = useRef(null);
    const [maxScroll, setMaxScroll] = useState({ x: 5000, y: 5000 });
    const [dataOffset, setDataOffset] = useState({ x: 0, y: 0 });
    const [selection, setSelection] = useState({ x1: -1, y1: -1, x2: -1, y2: -1 });
    const [knobArea, setKnobArea] = useState({ x1: -1, y1: -1, x2: -1, y2: -1 });
    const [editCell, setEditCell] = useState({ x: -1, y: -1 });
    const [editValue, setEditValue] = useState('');
    const [arrowKeyCommitMode, setArrowKeyCommitMode] = useState(false);
    const [shiftKeyDown, setShiftKeyDown] = useState(false);
    const [knobDragInProgress, setKnobDragInProgress] = useState(false);
    const [selectionInProgress, setSelectionInProgress] = useState(false);
    const [columnResize, setColumnResize] = useState(null);
    const [rowResize, setRowResize] = useState(null);
    const [rowSelectionInProgress, setRowSelectionInProgress] = useState(false);
    const [columnSelectionInProgress, setColumnSelectionInProgress] = useState(false);
    const [buttonClickMouseDownCoordinates, setButtonClickMouseDownCoordinates] = useState({
        x: -1,
        y: -1,
        hitTarget: null,
    });
    const { width: canvasWidth = 3000, height: canvasHeight = 3000 } = useResizeObserver({ ref: canvasRef });

    const selBorderColor = '#1b73e7';
    const selBackColor = '#e9f0fd';
    const knobSize = 6;
    const gridColor = '#e2e3e3';
    const knobAreaBorderColor = '#707070';
    const rowHeaderWidth = 50;
    const rowHeaderBackgroundColor = '#f8f9fa';
    const rowHeaderTextColor = '#666666';
    const rowHeaderSelectedBackgroundColor = '#e8eaed';
    const columnHeaderHeight = 22;
    const columnHeaderBackgroundColor = rowHeaderBackgroundColor;
    const columnHeaderSelectedBackgroundColor = rowHeaderSelectedBackgroundColor;
    const columnHeaderTextColor = rowHeaderTextColor;
    const xBinSize = 10;
    const yBinSize = 10;
    const scrollSpeed = 30;
    const resizeColumnRowMouseThreshold = 4;
    const minimumColumnWidth = 50;
    const minimumRowHeight = 22;

    const freezeColumns = props.freezeColumns || 0;
    const freezeRows = props.freezeRows || 0;

    const defaultCellStyle = {
        textAlign: 'left',
        fontSize: 13,
        marginRight: 5,
        marginLeft: 5,
        color: '#000',
        fontFamily: 'sans-serif',
        weight: '',
    };

    const cellWidth = createRowOrColumnPropFunction(props.cellWidth, 100);
    const cellHeight = createRowOrColumnPropFunction(props.cellHeight, 22);
    const columnHeaders = createRowOrColumnPropFunction(props.columnHeaders, null);

    const cellReadOnly = createCellPropFunction(props.readOnly, false);

    const sourceData = createCellPropFunction(props.sourceData, null);
    const displayData = createCellPropFunction(props.displayData, null);
    const editData = createCellPropFunction(props.editData, null);
    const cellStyle = createCellPropFunction(props.cellStyle, defaultCellStyle);

    // todo: somehow memoize, or only recalculate when inputs change...
    const { visible: visibleColumns, start: columnXStart, end: columnXEnd } = calculateRowsOrColsSizes(
        freezeColumns,
        cellWidth,
        rowHeaderWidth,
        dataOffset.x,
        canvasWidth
    );

    const { visible: visibleRows, start: rowYStart, end: rowYEnd } = calculateRowsOrColsSizes(
        freezeRows,
        cellHeight,
        columnHeaderHeight,
        dataOffset.y,
        canvasHeight
    );

    const changeSelection = (x1, y1, x2, y2, scrollToP2 = true) => {
        setSelection({ x1, y1, x2, y2 });

        if (scrollToP2) {
            const newDataOffset = { x: dataOffset.x, y: dataOffset.y };
            let newScrollLeft = -1;
            let newScrollTop = -1;

            if (!visibleColumns.includes(x2) || visibleColumns[visibleColumns.length - 1] === x2) {
                const increment = visibleColumns[visibleColumns.length - 1] <= x2 ? 1 : -1;
                const newX = Math.max(dataOffset.x, freezeColumns) + increment;
                newDataOffset.x = newX;
                newScrollLeft = newX * scrollSpeed;
            }

            if (!visibleRows.includes(y2) || visibleRows[visibleRows.length - 1] === y2) {
                const increment = visibleRows[visibleRows.length - 1] <= y2 ? 1 : -1;
                const newY = Math.max(dataOffset.y, freezeRows) + increment;
                newDataOffset.y = newY;
                newScrollTop = newY * scrollSpeed;
            }

            if (newDataOffset.x !== dataOffset.x || dataOffset.y !== newDataOffset.y) {
                setDataOffset({ x: newDataOffset.x, y: newDataOffset.y });
                setTimeout(() => {
                    if (overlayRef.current) {
                        if (newScrollLeft !== -1) {
                            overlayRef.current.scrollLeft = newScrollLeft;
                        }
                        if (newScrollTop !== -1) {
                            overlayRef.current.scrollTop = newScrollTop;
                        }
                    }
                }, 0);
            }
        }

        if (props.onSelectionChanged) {
            let sx1 = x1;
            let sy1 = y1;
            let sx2 = x2;
            let sy2 = y2;
            if (sx1 > sx2) {
                sx1 = x2;
                sx2 = x1;
            }
            if (sy1 > sy2) {
                sy1 = y2;
                sy2 = y1;
            }
            props.onSelectionChanged(sx1, sy1, sx2, sy2);
        }
    };

    const absCoordianteToCell = (absX, absY) => {
        let cellX = 0;
        let cellY = 0;

        for (let i = 0; i < visibleColumns.length; i++) {
            if (absX >= columnXStart[i] && absX <= columnXEnd[i]) {
                cellX = visibleColumns[i];
                break;
            }
        }
        for (let i = 0; i < visibleRows.length; i++) {
            if (absY >= rowYStart[i] && absY <= rowYEnd[i]) {
                cellY = visibleRows[i];
                break;
            }
        }

        return { x: cellX, y: cellY };
    };

    const cellToAbsCoordinate = (cellX, cellY) => {
        let absX = rowHeaderWidth;
        const indX = visibleColumns.findIndex((i) => i === cellX);
        if (indX !== -1) {
            absX = columnXStart[indX];
        } else {
            for (let i = 0; i < dataOffset.x; i++) {
                absX -= cellWidth(i);
            }
            for (let i = 0; i < cellX; i++) {
                absX += cellWidth(i);
            }
        }

        let absY = columnHeaderHeight;
        const indY = visibleRows.findIndex((i) => i === cellY);
        if (indY !== -1) {
            absY = rowYStart[indY];
        } else {
            for (let i = 0; i < dataOffset.y; i++) {
                absY -= cellHeight(i);
            }
            for (let i = 0; i < cellY; i++) {
                absY += cellHeight(i);
            }
        }
        return { x: absX, y: absY };
    };

    const knobCoordinates = useMemo(() => {
        if (selection.x2 !== -1 && selection.y2 !== -1) {
            let selx2 = selection.x2;
            if (selection.x1 > selection.x2) {
                selx2 = selection.x1;
            }

            let sely2 = selection.y2;
            if (selection.y1 > selection.y2) {
                sely2 = selection.y1;
            }
            const c = cellToAbsCoordinate(selx2, sely2);
            return { x: c.x + cellWidth(selx2), y: c.y + cellHeight(sely2) };
        }
        return { x: -1, y: -1 };
    }, [selection, visibleRows, visibleColumns]);

    const hitMap = useMemo(() => {
        const hitM = {};
        const canvas = canvasRef.current;
        if (!canvas) {
            return hitM;
        }
        resizeCanvas(canvas);
        let yCoord = columnHeaderHeight;
        for (const y of visibleRows) {
            let xCoord = rowHeaderWidth;
            for (const x of visibleColumns) {
                const cellContent = displayData(x, y);
                if (cellContent === null || cellContent === undefined) {
                    xCoord += cellWidth(x);
                    continue;
                }

                const xx = xCoord;
                const yy = yCoord + cellHeight(y) * 0.5;

                if (Array.isArray(cellContent)) {
                    for (const obj of cellContent) {
                        if (obj.onClick) {
                            const absX1 = xx + obj.x;
                            const absY1 = yy + obj.y;
                            const absX2 = absX1 + obj.width;
                            const absY2 = absY1 + obj.height;

                            const hitTarget = {
                                cellX: x,
                                cellY: y,
                                x: absX1,
                                y: absY1,
                                w: obj.width,
                                h: obj.height,
                                onClick: obj.onClick,
                            };

                            // add to hit map
                            const x1key = Math.floor(absX1 / xBinSize);
                            const x2key = Math.floor(absX2 / xBinSize);

                            const y1key = Math.floor(absY1 / yBinSize);
                            const y2key = Math.floor(absY2 / yBinSize);

                            for (let xkey = x1key; xkey <= x2key; xkey++) {
                                if (!hitM[xkey]) {
                                    hitM[xkey] = {};
                                }
                                const xbin = hitM[xkey];
                                for (let ykey = y1key; ykey <= y2key; ykey++) {
                                    if (!xbin[ykey]) {
                                        xbin[ykey] = [];
                                    }
                                    xbin[ykey].push(hitTarget);
                                }
                            }
                        }
                    }
                }
                xCoord += cellWidth(x);
            }
            yCoord += cellHeight(y);
        }
        return hitM;
    }, [displayData, props.cellWidth, props.cellHeight, dataOffset.x, dataOffset.y]);

    useEffect(() => {
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        let animationFrameId = window.requestAnimationFrame(() => {
            resizeCanvas(canvas);
            context.clearRect(0, 0, context.canvas.width, context.canvas.height);
            context.fillStyle = 'white';
            context.fillRect(0, 0, context.canvas.width, context.canvas.height);

            // apply cell fill color
            let yCoord1 = columnHeaderHeight;
            for (const y of visibleRows) {
                let xCoord1 = rowHeaderWidth;
                for (const x of visibleColumns) {
                    const style = cellStyle(x, y);
                    if (style.fillColor) {
                        context.fillStyle = style.fillColor;
                        context.fillRect(xCoord1, yCoord1, cellWidth(x), cellHeight(y));
                    }
                    xCoord1 += cellWidth(x);
                }
                yCoord1 += cellHeight(y);
            }

            let hideKnob = false;

            let selx1 = selection.x1;
            let selx2 = selection.x2;

            if (selection.x1 > selection.x2) {
                selx1 = selection.x2;
                selx2 = selection.x1;
            }

            let sely1 = selection.y1;
            let sely2 = selection.y2;

            if (selection.y1 > selection.y2) {
                sely1 = selection.y2;
                sely2 = selection.y1;
            }

            const selectionActive = selx1 !== -1 && selx2 !== -1 && sely1 !== -1 && sely2 !== -1;

            const p1 = cellToAbsCoordinate(selx1, sely1);
            const p2 = cellToAbsCoordinate(selx2, sely2);
            p2.x += cellWidth(selx2);
            p2.y += cellHeight(sely2);

            if (p1.x >= p2.x) {
                // recalculate if the selection span covers both frozen and unfrozen columns
                p2.x = p1.x;
                let currentCol = selx1;
                while (visibleColumns.includes(currentCol)) {
                    p2.x += cellWidth(currentCol);
                    currentCol++;
                }
                hideKnob = true;
            }

            if (p1.y >= p2.y) {
                // recalculate if the selection span covers both frozen and unfrozen rows
                p2.y = p1.y;
                let currentRow = sely1;
                while (visibleRows.includes(currentRow)) {
                    p2.y += cellHeight(currentRow);
                    currentRow++;
                }
                hideKnob = true;
            }

            // selection fill
            if (selectionActive) {
                context.fillStyle = selBackColor;
                context.fillRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
            }

            // row header background
            context.fillStyle = rowHeaderBackgroundColor;
            context.fillRect(0, 0, rowHeaderWidth, context.canvas.height);

            // row header selection
            if (selectionActive) {
                context.fillStyle = rowHeaderSelectedBackgroundColor;
                context.fillRect(0, p1.y, rowHeaderWidth, p2.y - p1.y);
            }

            // column header background
            context.fillStyle = columnHeaderBackgroundColor;
            context.fillRect(0, 0, context.canvas.width, columnHeaderHeight);

            // column header selection
            if (selectionActive) {
                context.fillStyle = columnHeaderSelectedBackgroundColor;
                context.fillRect(p1.x, 0, p2.x - p1.x, columnHeaderHeight);
            }

            // grid
            context.strokeStyle = gridColor;
            context.lineWidth = 1;
            let startX = rowHeaderWidth;

            for (const col of visibleColumns) {
                context.beginPath();
                context.moveTo(startX, 0);
                context.lineTo(startX, context.canvas.height);
                context.stroke();
                startX += cellWidth(col);
            }

            let startY = columnHeaderHeight;
            for (const row of visibleRows) {
                context.beginPath();
                context.moveTo(0, startY);
                context.lineTo(context.canvas.width, startY);
                context.stroke();
                startY += cellHeight(row);
            }

            // row header text
            startY = columnHeaderHeight;
            context.textBaseline = 'middle';
            context.textAlign = 'center';
            context.font = defaultCellStyle.fontSize + 'px ' + defaultCellStyle.fontFamily;
            context.fillStyle = rowHeaderTextColor;
            for (const row of visibleRows) {
                const xx = rowHeaderWidth * 0.5;
                const yy = startY + cellHeight(row) * 0.5;
                const cellContent = row + 1;
                context.fillText(cellContent, xx, yy);
                startY += cellHeight(row);
            }

            // column header text
            startX = rowHeaderWidth;
            context.textBaseline = 'middle';
            context.textAlign = 'center';
            for (const col of visibleColumns) {
                const xx = startX + cellWidth(col) * 0.5;
                const yy = columnHeaderHeight * 0.5;
                const ch = columnHeaders(col);
                let headerCellStyle = {};
                let cellContent = null;
                if (typeof ch === 'object' && ch !== null && ch.headerCellStyle) {
                    headerCellStyle = ch.headerCellStyle;
                }
                if (typeof ch === 'object' && ch !== null) {
                    cellContent = ch.cellContent;
                } else {
                    cellContent = ch;
                }

                headerCellStyle.color = headerCellStyle.color || columnHeaderTextColor;
                headerCellStyle.fontSize = headerCellStyle.fontSize || defaultCellStyle.fontSize;
                headerCellStyle.fontFamily = headerCellStyle.fontFamily || defaultCellStyle.fontFamily;
                headerCellStyle.weight = headerCellStyle.weight || defaultCellStyle.weight;
                context.font = headerCellStyle.weight + headerCellStyle.fontSize + 'px ' + headerCellStyle.fontFamily;
                context.fillStyle = headerCellStyle.color;
                if (cellContent === null || cellContent === undefined) {
                    cellContent = col + 1;
                }
                context.fillText(cellContent, xx, yy);
                startX += cellWidth(col);
            }

            // selection outline
            if (selectionActive) {
                context.strokeStyle = selBorderColor;
                context.lineWidth = 1;
                context.beginPath();
                context.rect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
                context.stroke();
            }

            // knob drag outline
            if (knobDragInProgress) {
                let kx1 = knobArea.x1;
                let kx2 = knobArea.x2;
                if (knobArea.x1 > knobArea.x2) {
                    kx1 = knobArea.x2;
                    kx2 = knobArea.x1;
                }

                let ky1 = knobArea.y1;
                let ky2 = knobArea.y2;
                if (knobArea.y1 > knobArea.y2) {
                    ky1 = knobArea.y2;
                    ky2 = knobArea.y1;
                }
                const knobPoint1 = cellToAbsCoordinate(kx1, ky1);
                const knobPoint2 = cellToAbsCoordinate(kx2 + 1, ky2 + 1);
                context.strokeStyle = knobAreaBorderColor;
                context.setLineDash([3, 3]);
                context.lineWidth = 1;
                context.beginPath();
                context.rect(knobPoint1.x, knobPoint1.y - 1, knobPoint2.x - knobPoint1.x, knobPoint2.y - knobPoint1.y);
                context.stroke();
                context.setLineDash([]);
            }

            // selection knob
            if (selectionActive && !hideKnob) {
                context.fillStyle = selBorderColor;
                context.fillRect(p2.x - knobSize * 0.5, p2.y - knobSize * 0.5, knobSize, knobSize);
            }

            // content
            context.textBaseline = 'middle';

            // draw content
            let yCoord = columnHeaderHeight;
            for (const y of visibleRows) {
                let xCoord = rowHeaderWidth;
                const ch = cellHeight(y);
                for (const x of visibleColumns) {
                    const cellContent = displayData(x, y);
                    const cw = cellWidth(x);
                    if (cellContent !== null && cellContent !== undefined) {
                        const style = cellStyle(x, y);
                        drawCell(context, cellContent, style, defaultCellStyle, xCoord, yCoord, cw, ch);
                    }
                    xCoord += cw;
                }
                yCoord += ch;
            }
        });

        return () => {
            window.cancelAnimationFrame(animationFrameId);
        };
    }, [
        props.displayData,
        dataOffset.x,
        dataOffset.y,
        selection,
        knobDragInProgress,
        knobArea,
        canvasWidth,
        canvasHeight,
        columnResize,
        cellWidth,
        cellHeight,
    ]);

    const setFocusToTextArea = () => {
        if (copyPasteTextAreaRef.current) {
            copyPasteTextAreaRef.current.focus({ preventScroll: true });
            copyPasteTextAreaRef.current.select();
        }
    };

    useEffect(() => {
        if (!editMode) {
            setCopyPasteText();
            if (document.activeElement === copyPasteTextAreaRef.current) {
                setFocusToTextArea();
            } else {
                const activeTagName = document.activeElement.tagName.toLowerCase();
                if (
                    !(
                        (activeTagName === 'div' && document.activeElement.contentEditable === 'true') ||
                        activeTagName === 'input' ||
                        activeTagName === 'textarea' ||
                        activeTagName === 'select'
                    )
                ) {
                    setFocusToTextArea();
                }
            }
        }
    });

    const onPaste = (e) => {
        if (!copyPasteTextAreaRef) {
            return;
        }
        if (e.target !== copyPasteTextAreaRef.current) {
            return;
        }
        e.preventDefault();

        const clipboardData = e.clipboardData || window.clipboardData;

        const types = clipboardData.types;
        if (types.includes('text/html')) {
            const pastedHtml = clipboardData.getData('text/html');
            parsePastedHtml(pastedHtml);
        } else if (types.includes('text/plain')) {
            const text = clipboardData.getData('text/plain');
            parsePastedText(text);
        }
    };

    useEffect(() => {
        window.document.addEventListener('paste', onPaste);
        return () => {
            window.document.removeEventListener('paste', onPaste);
        };
    });

    const findTable = (element) => {
        for (const child of element.children) {
            if (child.nodeName === 'TABLE') {
                return child;
            }
            const maybeTable = findTable(child);
            if (maybeTable) {
                return maybeTable;
            }
        }
    };

    const parsePastedHtml = (html) => {
        const div = document.createElement('div');
        div.innerHTML = html.trim();
        let pasteLocX = -1;
        let pasteLocY = -1;
        if (selection.x1 !== -1 && selection.x2 === -1) {
            pasteLocX = selection.x1;
        }
        if (selection.y1 !== -1 && selection.y2 === -1) {
            pasteLocY = selection.y1;
        }
        if (selection.x1 !== -1 && selection.x2 !== -1) {
            pasteLocX = Math.min(selection.x1, selection.x2);
        }
        if (selection.y1 !== -1 && selection.y2 !== -1) {
            pasteLocY = Math.min(selection.y1, selection.y2);
        }
        if (pasteLocX === -1 || pasteLocY === -1) {
            return;
        }

        let x = pasteLocX;
        let y = pasteLocY;
        const changes = [];

        const tableNode = findTable(div);
        if (!tableNode) {
            return;
        }

        for (const tableChild of tableNode.children) {
            if (tableChild.nodeName === 'TBODY') {
                for (const tr of tableChild.children) {
                    x = pasteLocX;
                    if (tr.nodeName === 'TR') {
                        for (const td of tr.children) {
                            if (td.nodeName === 'TD') {
                                changes.push({ y: y, x: x, value: td.innerHTML });
                                x++;
                            }
                        }
                        y++;
                    }
                }
            }
        }

        if (props.onChange) {
            props.onChange(changes);
        }
        let pasteX2 = x - 1;
        let pasteY2 = y - 1;
        changeSelection(pasteLocX, pasteLocY, pasteX2, pasteY2, false);
    };

    const parsePastedText = (text) => {
        let pasteLocX = -1;
        let pasteLocY = -1;
        if (selection.x1 !== -1 && selection.x2 === -1) {
            pasteLocX = selection.x1;
        }
        if (selection.y1 !== -1 && selection.y2 === -1) {
            pasteLocY = selection.y1;
        }
        if (selection.x1 !== -1 && selection.x2 !== -1) {
            pasteLocX = Math.min(selection.x1, selection.x2);
        }
        if (selection.y1 !== -1 && selection.y2 !== -1) {
            pasteLocY = Math.min(selection.y1, selection.y2);
        }
        if (pasteLocX === -1 || pasteLocY === -1) {
            return;
        }

        const rows = text.split(/\r?\n/);
        let pasteX2 = pasteLocX;
        let pasteY2 = pasteLocY + rows.length - 1;
        const changes = [];
        for (let y = 0; y < rows.length; y++) {
            const cols = rows[y].split('\t');

            if (pasteLocX + cols.length - 1 > pasteX2) {
                pasteX2 = pasteLocX + cols.length - 1;
            }
            for (let x = 0; x < cols.length; x++) {
                changes.push({ y: pasteLocY + y, x: pasteLocX + x, value: cols[x] });
            }
        }

        if (props.onChange) {
            props.onChange(changes);
        }
        changeSelection(pasteLocX, pasteLocY, pasteX2, pasteY2, false);
    };

    const setCopyPasteText = () => {
        if (selection.x1 === -1 || selection.y1 === -1 || selection.x2 === -1 || selection.y2 === -1) {
            return;
        }

        let dy1 = selection.y1;
        let dy2 = selection.y2;
        if (dy1 > dy2) {
            dy1 = selection.y2;
            dy2 = selection.y1;
        }

        let dx1 = selection.x1;
        let dx2 = selection.x2;
        if (dx1 > dx2) {
            dx1 = selection.x2;
            dx2 = selection.x1;
        }

        const rows = [];
        for (let y = dy1; y <= dy2; y++) {
            const row = [];
            for (let x = dx1; x <= dx2; x++) {
                const value = editData(x, y);
                if (value !== null && value !== undefined) {
                    row.push(value);
                } else {
                    row.push('');
                }
            }
            rows.push(row.join('\t'));
        }
        const cptext = rows.join('\n');
        if (copyPasteTextAreaRef.current) {
            copyPasteTextAreaRef.current.value = cptext;
        }
    };

    const commitEditingCell = () => {
        if (props.onChange) {
            props.onChange([{ x: editCell.x, y: editCell.y, value: editValue }]);
        }

        setEditCell({ x: -1, y: -1 });
    };

    const startEditingCell = (editCell) => {
        if (cellReadOnly(editCell.x, editCell.y)) {
            return;
        }

        const editDataValue = editData(editCell.x, editCell.y);
        let val = '';
        if (editDataValue !== null && editDataValue !== undefined) {
            val = editDataValue;
        }
        setEditCell(editCell);
        setEditValue(val);
    };

    const onScroll = (e) => {
        const absX = e.target.scrollLeft;
        const absY = e.target.scrollTop;

        const cellX = Math.floor(absX / scrollSpeed);
        const cellY = Math.floor(absY / scrollSpeed);
        if (cellX !== dataOffset.x || cellY !== dataOffset.y) {
            setDataOffset({ x: cellX, y: cellY });
        }

        let newMaxScroll = { ...maxScroll };
        if (maxScroll.x / (absX + 0.5) < 1) {
            newMaxScroll.x *= 1.5;
        }
        if (maxScroll.y / (absY + 0.5) < 1) {
            newMaxScroll.y *= 1.5;
        }
        if (newMaxScroll.x !== maxScroll.x || maxScroll.y !== newMaxScroll.y) {
            setMaxScroll({ ...newMaxScroll });
        }
    };

    const onMouseLeave = (e) => {
        window.document.body.style.cursor = 'auto';
    };

    const onMouseDown = (e) => {
        if (e.button !== 0) {
            return;
        }
        const rect = e.target.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (x > canvasWidth || y > canvasHeight) {
            return;
        }

        const hitTargetKeyX = Math.floor(x / xBinSize);
        const hitTargetKeyY = Math.floor(y / yBinSize);

        if (hitMap[hitTargetKeyX] && hitMap[hitTargetKeyX][hitTargetKeyY]) {
            for (const hitTarget of hitMap[hitTargetKeyX][hitTargetKeyY]) {
                if (
                    hitTarget.x <= x &&
                    x <= hitTarget.x + hitTarget.w &&
                    hitTarget.y <= y &&
                    y <= hitTarget.y + hitTarget.h
                ) {
                    setButtonClickMouseDownCoordinates({ x, y, hitTarget });
                    return;
                }
            }
        }

        if (y < columnHeaderHeight) {
            let xx = rowHeaderWidth;
            for (const col of visibleColumns) {
                if (Math.abs(xx - x) < resizeColumnRowMouseThreshold) {
                    window.document.body.style.cursor = 'col-resize';
                    setColumnResize({
                        startX: xx,
                        oldWidth: cellWidth(col - 1),
                        colIdx: col - 1,
                    });
                    return;
                }
                xx += cellWidth(col);
            }
        }
        if (x < rowHeaderWidth) {
            let yy = columnHeaderHeight;
            for (const row of visibleRows) {
                if (Math.abs(yy - y) < resizeColumnRowMouseThreshold) {
                    window.document.body.style.cursor = 'row-resize';
                    setRowResize({
                        startY: yy,
                        oldHeight: cellHeight(row - 1),
                        rowIdx: row - 1,
                    });
                    return;
                }
                yy += cellHeight(row);
            }
        }

        // knob drag mode
        if (Math.abs(x - knobCoordinates.x) < knobSize && Math.abs(y - knobCoordinates.y) < knobSize) {
            setKnobDragInProgress(true);
            setKnobArea({ x1: selection.x1, y1: selection.y1, x2: selection.x2, y2: selection.y2 });
            return;
        }

        const sel2 = absCoordianteToCell(x, y);
        const sel1 = shiftKeyDown ? { x: selection.x1, y: selection.y1 } : { ...sel2 };

        if (editMode) {
            commitEditingCell();
        }

        let scrollToP2 = true;

        if (x < rowHeaderWidth) {
            sel2.x = 100;
            scrollToP2 = false;
            setRowSelectionInProgress(true);
        } else {
            setRowSelectionInProgress(false);
        }

        if (y < columnHeaderHeight) {
            sel2.y = 100;
            scrollToP2 = false;
            setColumnSelectionInProgress(true);
        } else {
            setColumnSelectionInProgress(false);
        }

        setSelectionInProgress(true);
        changeSelection(sel1.x, sel1.y, sel2.x, sel2.y, scrollToP2);
        setEditCell({ x: -1, y: -1 });
    };

    const onMouseUp = (e) => {
        if (knobDragInProgress) {
            let sx1 = selection.x1;
            let sx2 = selection.x2;
            if (selection.x1 > selection.x2) {
                sx1 = selection.x2;
                sx2 = selection.x1;
            }
            let sy1 = selection.y1;
            let sy2 = selection.y2;
            if (selection.y1 > selection.y2) {
                sy1 = selection.y2;
                sy2 = selection.y1;
            }
            let kx1 = knobArea.x1;
            let kx2 = knobArea.x2;
            if (knobArea.x1 > knobArea.x2) {
                kx1 = knobArea.x2;
                kx2 = knobArea.x1;
            }
            let ky1 = knobArea.y1;
            let ky2 = knobArea.y2;
            if (knobArea.y1 > knobArea.y2) {
                ky1 = knobArea.y2;
                ky2 = knobArea.y1;
            }

            let fx1 = kx1;
            let fy1 = ky1;
            let fx2 = kx2;
            let fy2 = ky2;

            const changes = [];

            if (fx2 - fx1 === sx2 - sx1) {
                // vertical
                if (fy1 === sy1) {
                    fy1 = sy2 + 1;
                } else {
                    fy2 = sy1 - 1;
                }

                let srcY = sy1;
                for (let y = fy1; y <= fy2; y++) {
                    for (let x = fx1; x <= fx2; x++) {
                        const value = sourceData(x, srcY);
                        changes.push({ x: x, y: y, value: value });
                    }
                    srcY = srcY + 1;
                    if (srcY > sy2) {
                        srcY = sy1;
                    }
                }
            } else {
                // horizontal
                if (fx1 === sx1) {
                    fx1 = sx2 + 1;
                } else {
                    fx2 = sx1 - 1;
                }
                let srcX = sx1;
                for (let x = fx1; x <= fx2; x++) {
                    for (let y = fy1; y <= fy2; y++) {
                        const value = sourceData(srcX, y);
                        changes.push({ x: x, y: y, value: value });
                    }
                    srcX = srcX + 1;
                    if (srcX > sx2) {
                        srcX = sx1;
                    }
                }
            }

            if (props.onChange) {
                props.onChange(changes);
            }

            changeSelection(knobArea.x1, knobArea.y1, knobArea.x2, knobArea.y2);
        }
        setSelectionInProgress(false);
        setRowSelectionInProgress(false);
        setColumnSelectionInProgress(false);
        setKnobDragInProgress(false);
        setColumnResize(null);
        setRowResize(null);

        if (
            buttonClickMouseDownCoordinates.x !== -1 &&
            buttonClickMouseDownCoordinates.y !== -1 &&
            buttonClickMouseDownCoordinates.hitTarget !== null
        ) {
            const rect = e.target.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const hitTarget = buttonClickMouseDownCoordinates.hitTarget;
            if (
                hitTarget.x <= x &&
                x <= hitTarget.x + hitTarget.w &&
                hitTarget.y <= y &&
                y <= hitTarget.y + hitTarget.h
            ) {
                hitTarget.onClick();
            }
            setButtonClickMouseDownCoordinates({ x: -1, y: -1, hitTarget: null });
        }
    };

    useEffect(() => {
        window.addEventListener('mouseup', onMouseUp);
        return () => {
            window.removeEventListener('mouseup', onMouseUp);
        };
    });

    const onMouseMove = (e) => {
        const rect = e.target.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        window.document.body.style.cursor = 'auto';

        const hitTargetKeyX = Math.floor(x / xBinSize);
        const hitTargetKeyY = Math.floor(y / yBinSize);

        if (hitMap[hitTargetKeyX] && hitMap[hitTargetKeyX][hitTargetKeyY]) {
            for (const hitTarget of hitMap[hitTargetKeyX][hitTargetKeyY]) {
                if (
                    hitTarget.x <= x &&
                    x <= hitTarget.x + hitTarget.w &&
                    hitTarget.y <= y &&
                    y <= hitTarget.y + hitTarget.h
                ) {
                    window.document.body.style.cursor = 'pointer';
                }
            }
        }

        if (props.onCellWidthChange && y < columnHeaderHeight) {
            let xx = rowHeaderWidth;
            for (const col of visibleColumns) {
                if (Math.abs(xx - x) < resizeColumnRowMouseThreshold) {
                    window.document.body.style.cursor = 'col-resize';
                    break;
                }
                xx += cellWidth(col);
            }
        }

        if (props.onCellHeightChange && x < rowHeaderWidth) {
            let yy = columnHeaderHeight;
            for (const row of visibleRows) {
                if (Math.abs(yy - y) < resizeColumnRowMouseThreshold) {
                    window.document.body.style.cursor = 'row-resize';
                    break;
                }
                yy += cellHeight(row);
            }
        }

        if (Math.abs(x - knobCoordinates.x) < knobSize && Math.abs(y - knobCoordinates.y) < knobSize) {
            window.document.body.style.cursor = 'crosshair';
        }

        if (columnResize) {
            if (props.onCellWidthChange) {
                const newWidth = Math.max(columnResize.oldWidth + x - columnResize.startX, minimumColumnWidth);
                props.onCellWidthChange(columnResize.colIdx, newWidth);
            }
            return;
        }

        if (rowResize) {
            if (props.onCellHeightChange) {
                const newHeight = Math.max(rowResize.oldHeight + y - rowResize.startY, minimumRowHeight);
                props.onCellHeightChange(rowResize.rowIdx, newHeight);
            }
            return;
        }

        if (selectionInProgress) {
            const sel2 = absCoordianteToCell(x, y);
            if (rowSelectionInProgress) {
                changeSelection(selection.x1, selection.y1, selection.x2, sel2.y, false);
            } else if (columnSelectionInProgress) {
                changeSelection(selection.x1, selection.y1, sel2.x, selection.y2, false);
            } else {
                changeSelection(selection.x1, selection.y1, sel2.x, sel2.y);
            }
        }

        if (knobDragInProgress) {
            window.document.body.style.cursor = 'crosshair';
            const cell = absCoordianteToCell(x, y);

            let x1 = selection.x1;
            let y1 = selection.y1;
            let x2 = selection.x2;
            let y2 = selection.y2;
            if (x1 > x2) {
                x1 = selection.x2;
                x2 = selection.x1;
            }
            if (y1 > y2) {
                y1 = selection.y2;
                y2 = selection.y1;
            }

            // check if vertical or horizontal
            if (Math.abs(cell.x - (x1 + x2) * 0.5) < Math.abs(cell.y - (y1 + y2) * 0.5)) {
                if (cell.y < y1) {
                    y1 = cell.y;
                } else {
                    y2 = cell.y;
                }
            } else {
                if (cell.x < x1) {
                    x1 = cell.x;
                } else {
                    x2 = cell.x;
                }
            }
            setKnobArea({ x1: x1, y1: y1, x2: x2, y2: y2 });
        }
    };

    const onDoubleClick = (e) => {
        const rect = e.target.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const editCell = absCoordianteToCell(x, y);
        setArrowKeyCommitMode(false);
        startEditingCell(editCell);
    };

    const onKeyDown = (e) => {
        if (e.key === 'Escape') {
            setEditCell({ x: -1, y: -1 });
            return;
        }
        if (e.key === 'Enter') {
            commitEditingCell();
            changeSelection(selection.x1, selection.y1 + 1, selection.x1, selection.y1 + 1);
        }
        if (e.key === 'Tab') {
            e.preventDefault();
            commitEditingCell();
            changeSelection(selection.x1 + 1, selection.y1, selection.x1 + 1, selection.y1);
        }
        if (arrowKeyCommitMode && ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
            e.preventDefault();
            commitEditingCell();
            let x1 = selection.x1;
            let y1 = selection.y1;
            let x2 = selection.x1;
            let y2 = selection.y1;
            if (e.key === 'ArrowRight') {
                x1 = selection.x1 + 1;
                x2 = selection.x1 + 1;
            } else if (e.key === 'ArrowLeft') {
                x1 = selection.x1 - 1;
                x2 = selection.x1 - 1;
            } else if (e.key === 'ArrowUp') {
                y1 = selection.y1 - 1;
                y2 = selection.y1 - 1;
            } else if (e.key === 'ArrowDown') {
                y1 = selection.y1 + 1;
                y2 = selection.y1 + 1;
            }
            changeSelection(x1, y1, x2, y2);
        }
    };

    const onGridKeyDown = (e) => {
        if (editMode && arrowKeyCommitMode && ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
            commitEditingCell();
            return;
        }

        if (e.key === 'Shift') {
            setShiftKeyDown(true);
            return;
        }

        if ((e.metaKey || e.ctrlKey) && String.fromCharCode(e.which).toLowerCase() === 'v') {
            return;
        }

        // copy
        if ((e.metaKey || e.ctrlKey) && String.fromCharCode(e.which).toLowerCase() === 'c') {
            return;
        }

        if (e.key === 'Backspace' || e.key === 'Delete') {
            let x1 = selection.x1;
            let y1 = selection.y1;
            let x2 = selection.x2;
            let y2 = selection.y2;
            if (x1 > x2) {
                x1 = selection.x2;
                x2 = selection.x1;
            }
            if (y1 > y2) {
                y1 = selection.y2;
                y2 = selection.y1;
            }
            const changes = [];
            for (let y = y1; y <= y2; y++) {
                for (let x = x1; x <= x2; x++) {
                    changes.push({ x: x, y: y, value: null });
                }
            }
            if (props.onChange) {
                props.onChange(changes);
            }
            return;
        }

        // nothing selected
        if (selection.x1 === -1 || selection.x2 === -1 || selection.y1 === -1 || selection.y2 === -1) {
            return;
        }

        if (
            (e.keyCode >= 48 && e.keyCode <= 57) ||
            (e.keyCode >= 96 && e.keyCode <= 105) ||
            (e.keyCode >= 65 && e.keyCode <= 90) ||
            e.key === 'Enter' ||
            e.key === '-' ||
            e.key === '.' ||
            e.key === ','
        ) {
            if (cellReadOnly(selection.x1, selection.y1)) {
                e.preventDefault(); // so we dont get keystrokes inside the text area
                return;
            }

            startEditingCell({ x: selection.x1, y: selection.y1 });
            setArrowKeyCommitMode(e.key !== 'Enter');
            return;
        }

        if (['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
            let sel1 = { x: selection.x1, y: selection.y1 };
            let sel2 = { x: selection.x2, y: selection.y2 };

            if (e.key === 'ArrowRight' || e.key === 'Tab') {
                sel2.x += 1;
            } else if (e.key === 'ArrowLeft') {
                sel2.x -= 1;
            } else if (e.key === 'ArrowUp') {
                sel2.y -= 1;
            } else if (e.key === 'ArrowDown') {
                sel2.y += 1;
            }
            if (sel2.x < 0) {
                sel2.x = 0;
            }
            if (sel2.y < 0) {
                sel2.y = 0;
            }
            if (!e.shiftKey) {
                sel1 = { ...sel2 };
            }
            changeSelection(sel1.x, sel1.y, sel2.x, sel2.y);
            return;
        }
        e.preventDefault();
    };

    const onGridKeyUp = (e) => {
        setShiftKeyDown(e.shiftKey);
    };

    const onContextMenu = (e) => {
        if (!props.onRightClick) {
            return;
        }
        const rect = e.target.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const cell = absCoordianteToCell(x, y);
        e.cellX = cell.x;
        e.cellY = cell.y;

        if (y > columnHeaderHeight && x > rowHeaderWidth) {
            onMouseMove(e);
            props.onRightClick(e);
        }
    };

    const editMode = editCell.x !== -1 && editCell.y !== -1;
    let editTextPosition = { x: 0, y: 0 };
    let editTextWidth = 0;
    let editTextHeight = 0;
    let editTextTextAlign = 'right';
    if (editMode) {
        editTextPosition = cellToAbsCoordinate(editCell.x, editCell.y);
        const style = cellStyle(editCell.x, editCell.y);
        // add 1 so it doesnt cover the selection border
        editTextPosition.x += 1;
        editTextPosition.y += 1;
        editTextWidth = cellWidth(editCell.x) - 2;
        editTextHeight = cellHeight(editCell.y) - 2;
        editTextTextAlign = style.textAlign || defaultCellStyle.textAlign;
    }

    return (
        <div style={{ position: 'relative', height: '100%' }}>
            <canvas
                style={{
                    width: 'calc(100% - 14px)',
                    height: 'calc(100% - 15px)',
                    outline: '1px solid #ddd', // find another better solution ?
                }}
                ref={canvasRef}
            />
            <div
                ref={overlayRef}
                onDoubleClick={onDoubleClick}
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseLeave={onMouseLeave}
                onContextMenu={onContextMenu}
                onScroll={onScroll}
                className={styles.sheetscroll}
                style={{
                    position: 'absolute',
                    width: '100%',
                    height: '100%',
                    top: 0,
                    left: 0,
                    overflow: 'scroll',
                    borderBottom: '1px solid #ddd',
                }}
            >
                <div
                    style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        width: 1,
                        height: maxScroll.y + 2000,
                        backgroundColor: 'rgba(0,0,0,0.0)',
                    }}
                ></div>
                <div
                    style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        width: maxScroll.x + 5000,
                        height: 1,
                        backgroundColor: 'rgba(0,0,0,0.0)',
                    }}
                ></div>
            </div>
            <textarea
                style={{ position: 'absolute', top: 0, left: 0, width: 1, height: 1, opacity: 0.01 }}
                ref={copyPasteTextAreaRef}
                onFocus={(e) => e.target.select()}
                autoFocus
                tabIndex="0"
                onKeyDown={onGridKeyDown}
                onKeyUp={onGridKeyUp}
            ></textarea>

            {editMode && (
                <input
                    type="text"
                    onFocus={(e) => e.target.select()}
                    autoFocus
                    onKeyDown={onKeyDown}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    style={{
                        position: 'absolute',
                        top: editTextPosition.y,
                        left: editTextPosition.x,
                        width: editTextWidth,
                        height: editTextHeight,
                        outline: 'none',
                        border: 'none',
                        textAlign: editTextTextAlign,
                        color: 'black',
                        fontSize: defaultCellStyle.fontSize,
                        fontFamily: 'sans-serif',
                    }}
                />
            )}
        </div>
    );
}

export default Sheet;