import React, { useEffect, useRef } from 'react'

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

// Creating a closure by returning a func can help not declaring (or polluting) the values in global scope
function getSize(value) {
    return () => {
        return value;
    }
}

function calculateRowsOrColsSizes(size, startingIndex, startingSize, visibleArea) {
    const visible = []; // track visible rowsOrCols
    const start = []; // track start co-ordinates for rowsOrCols
    const end = []; // track end co-ordinates for rowsOrCols
    let prev = 0;

    // We want to start from the 1st row or 1st column, excluding the row or column headers, so 0th idx would be the 1st row or columns start and end
    visible.push(startingIndex);
    start.push(startingSize);
    prev = startingSize + size();
    end.push(prev);

    let idx = startingIndex + 1;

    while (true) {
        visible.push(idx);
        start.push(prev);
        prev = prev + size();
        end.push(prev);

        if (end[end.length-1] >= visibleArea) {
            break;
        }

        idx++;
    }

    return {
        visible,
        start,
        end
    }
}

function drawCell(context, xCoord, yCoord, cellWidth, cellHeight) {
    context.fillStyle = 'white';

    // Draw the cell
    context.save();
    context.beginPath();
    context.rect(xCoord, yCoord, cellWidth, cellHeight);
    context.clip(); // when using clip you need to save the context settings and after done you can restore the settings back
    context.stroke();
    context.restore();
}

const Sheet = () => {
    const canvasRef = useRef(null);

    // Constants
    const canvasWidth = window.innerWidth || 3000;
    const canvasHeight = window.innerHeight || 3000;

    const cellWidth = getSize(100);
    const cellHeight = getSize(22);

    const rowHeaderWidth = 50;
    const columnHeaderHeight = 22;

    // Calculate required rows sizes
    const { visible: visibleRows, start: rowYStart, end: rowYEnd } = calculateRowsOrColsSizes(cellWidth, 0, rowHeaderWidth, canvasWidth);

    // Calc required columns sizes
    const { visible: visibleColumns, start: columnXStart, end: columnXEnd } = calculateRowsOrColsSizes(cellHeight, 0, columnHeaderHeight, canvasHeight);

    useEffect(() => {
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        // resizeCanvas(canvas);

        context.strokeStyle = 'red';
        context.lineWidth = 1;

        context.clearRect(0, 0, context.canvas.width, context.canvas.height);
        context.fillStyle = 'pink';
        context.fillRect(0, 0, context.canvas.width, context.canvas.height);

        // Apply cell fill color
        let yCoord1 = columnHeaderHeight;
        for (const y of visibleRows) {
            let xCoord1 = rowHeaderWidth;
            for (const x of visibleColumns) {
                context.fillStyle = 'red';
                context.fillRect(xCoord1, yCoord1, cellWidth(), cellHeight());
                xCoord1 += cellWidth();
            }
            yCoord1 += cellHeight();
        }

        // Grid lines
        context.strokeStyle = 'white';
        context.lineWidth = 1;
        
        let startX = rowHeaderWidth;
        for (const col of visibleColumns) {
            context.beginPath();
            context.moveTo(startX, 0);
            context.lineTo(startX, context.canvas.height);
            context.stroke();
            startX += cellWidth();
        }

        let startY = columnHeaderHeight;
        for (const row of visibleRows) {
            context.beginPath();
            context.moveTo(0, startY);
            context.lineTo(context.canvas.width, startY);
            context.stroke();
            startY += cellHeight();
        }
        
        // Draw cells row-wise and then in each row, draw all cells col-wise
        // let yCoord = columnHeaderHeight;
        // for (const y of visibleRows) {
        //     let xCoord = rowHeaderWidth;
        //     const ch = cellHeight();
        //     for (const x of visibleColumns) {
        //         const cw = cellWidth();
        //         drawCell(context, xCoord, yCoord, cw, ch); // draw cell
        //         xCoord += cw;
        //     }
        //     yCoord += ch;
        // }
    }, [
        canvasWidth,
        canvasHeight
    ])

    return (
        <>
            <canvas 
                ref={canvasRef} 
                width={canvasWidth}
                height={canvasHeight}
            />
        </>
    )
}

export default Sheet;