import React from 'react'

function getSize(value) {
    return () => {
        return value;
    }
}

function calculateRowsOrColsSizes(size, startingIndex, startingSize, visibleArea) {
    const visible = [];
    const start = [];
    const end = [];
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

export const Sheet = () => {
    const canvasWidth = 3000;
    const canvasHeight = 3000;

    const cellWidth = getSize(100);
    const cellHeight = getSize(22);

    const rowHeaderWidth = 50;
    const columnHeaderHeight = 22;

    // Calculate required rows sizes
    const { visible: visibleRows, start: rowYStart, end: rowYEnd } = calculateRowsOrColsSizes(cellWidth, 0, rowHeaderWidth, canvasWidth);

    console.log(visibleRows, rowYStart, rowYEnd);

    // Calc required columns sizes
    const { visible: visibleColumns, start: columnXStart, end: columnXEnd } = calculateRowsOrColsSizes(cellHeight, 0, columnHeaderHeight, canvasHeight);

    return <>Canvas</>
}