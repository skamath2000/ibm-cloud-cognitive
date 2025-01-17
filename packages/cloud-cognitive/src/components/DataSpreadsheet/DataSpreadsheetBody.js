/**
 * Copyright IBM Corp. 2022, 2022
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

import React, { useRef, useCallback, useEffect, forwardRef } from 'react';
import PropTypes from 'prop-types';
import { FixedSizeList } from 'react-window';
import cx from 'classnames';

import { pkg } from '../../settings';
import { deepCloneObject } from '../../global/js/utils/deepCloneObject';
import uuidv4 from '../../global/js/utils/uuidv4';
import { usePreviousValue } from '../../global/js/hooks';

import { removeCellSelections } from './utils/removeCellSelections';
import { createCellSelectionArea } from './utils/createCellSelectionArea';
import { checkActiveHeaderCell } from './utils/checkActiveHeaderCell';
import { handleHeaderCellSelection } from './utils/handleHeaderCellSelection';

const blockClass = `${pkg.prefix}--data-spreadsheet`;

export const DataSpreadsheetBody = forwardRef(
  (
    {
      columns,
      activeCellCoordinates,
      defaultColumn,
      getTableBodyProps,
      id,
      prepareRow,
      rows,
      selectionAreaData,
      setSelectionAreaData,
      setActiveCellCoordinates,
      selectionAreas,
      setContainerHasFocus,
      setSelectionAreas,
      scrollBarSize,
      totalColumnsWidth,
      clickAndHoldActive,
      setClickAndHoldActive,
      currentMatcher,
      setCurrentMatcher,
      onSelectionAreaChange,
    },
    ref
  ) => {
    const previousState = usePreviousValue({
      selectionAreaData,
      clickAndHoldActive,
    });

    // Call the `onSelectionAreaChange` handler to send selection area data
    // back to the consumer
    useEffect(() => {
      if (selectionAreaData.length) {
        if (
          (!clickAndHoldActive && previousState?.clickAndHoldActive) ||
          previousState?.selectionAreaData?.length !== selectionAreaData?.length
        ) {
          onSelectionAreaChange(selectionAreaData);
        }
      }
    }, [
      previousState?.selectionAreaData,
      selectionAreaData,
      onSelectionAreaChange,
      clickAndHoldActive,
      previousState?.clickAndHoldActive,
    ]);

    // Create cell selection areas based on selectionAreas array
    useEffect(() => {
      if (selectionAreas && selectionAreas.length) {
        selectionAreas.map((area) => {
          // Setup selection area data that will be sent back to consumer via onSelectionAreaChange prop
          if (area.areaCreated) {
            const rowStart = Math.min(area.point1.row, area.point2.row);
            const rowEnd = Math.max(area.point1.row, area.point2.row);
            const columnStart = Math.min(
              area.point1.column,
              area.point2.column
            );
            const columnEnd = Math.max(area.point1.column, area.point2.column);
            const selectionData = {
              rows: {
                start: rowStart,
                end: rowEnd,
              },
              columns: {
                start: columnStart,
                end: columnEnd,
              },
              cells: populateSelectionAreaCellData({
                rowStart,
                rowEnd,
                columnStart,
                columnEnd,
              }),
              selectionId: area.matcher,
            };
            setSelectionAreaData((prev) => {
              const prevValues = deepCloneObject(prev);
              const newAreaData = prevValues.filter(
                (item) => item.selectionId !== area.matcher
              );
              return [...newAreaData, selectionData];
            });
          }
          if (!area.areaCreated && area.point1 && area.point2 && area.matcher) {
            createCellSelectionArea({
              area,
              blockClass,
              defaultColumn,
              selectionAreas,
              setSelectionAreas,
            });
          }
          return;
        });
      }
    }, [
      selectionAreas,
      setSelectionAreas,
      defaultColumn,
      onSelectionAreaChange,
      setSelectionAreaData,
    ]);

    const populateSelectionAreaCellData = ({
      rowStart,
      rowEnd,
      columnStart,
      columnEnd,
    }) => {
      const cellContainer = [];
      for (let rowIndex = rowStart; rowIndex <= rowEnd; rowIndex++) {
        for (
          let columnIndex = columnStart;
          columnIndex <= columnEnd;
          columnIndex++
        ) {
          cellContainer.push([rowIndex, columnIndex]);
        }
      }
      return cellContainer;
    };

    // Mouse up
    useEffect(() => {
      const handleMouseUp = (event) => {
        setClickAndHoldActive(false);
        const cellButton = event.target.closest(`.${blockClass}__body--td`);
        if (cellButton) {
          const endCellCoordinates = {
            row: Number(cellButton.getAttribute('data-row-index')),
            column: Number(cellButton.getAttribute('data-column-index')),
          };
          setSelectionAreas((prev) => {
            const selectionAreaClone = deepCloneObject(prev);
            const indexOfItemToUpdate = selectionAreaClone.findIndex(
              (item) => item.matcher === currentMatcher
            );
            // No items in the array have an object that matches the value of currentMatcher
            if (indexOfItemToUpdate === -1) {
              return prev;
            }
            selectionAreaClone[indexOfItemToUpdate].point2 = endCellCoordinates;
            selectionAreaClone[indexOfItemToUpdate].areaCreated = false;
            return selectionAreaClone;
          });
        }
      };
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }, [
      selectionAreas,
      currentMatcher,
      setSelectionAreas,
      setClickAndHoldActive,
      setCurrentMatcher,
      ref,
    ]);

    // Make sure that if the cellSize prop changes, the active
    // cell also gets updated with the new size
    useEffect(() => {
      const listContainer = spreadsheetBodyRef?.current;
      const activeCellButton = listContainer.querySelector(
        `.${blockClass}__active-cell--highlight`
      );
      if (activeCellButton) {
        activeCellButton.style.height = `${defaultColumn?.rowHeight}px`;
      }
    }, [defaultColumn?.rowHeight]);

    // onClick fn for each cell in the data spreadsheet body,
    // adds the active cell highlight
    const handleBodyCellClick = useCallback(
      (cell, columnIndex) => {
        return (event) => {
          event.preventDefault();
          const isHoldingCommandKey = event.metaKey || event.ctrlKey;
          const isHoldingShiftKey = event.shiftKey;
          setContainerHasFocus(true);
          const activeCoordinates = {
            row: cell.row.index,
            column: columnIndex,
          };
          const tempMatcher = uuidv4();
          setClickAndHoldActive(true);

          // prevent multiple selections unless cmd key is held
          // meaning that selectionAreas should only have one item by default
          if (isHoldingCommandKey) {
            setActiveCellCoordinates(activeCoordinates);
            setCurrentMatcher(tempMatcher);
            setSelectionAreas((prev) => [
              ...prev,
              { point1: activeCoordinates, matcher: tempMatcher },
            ]);
          } else if (isHoldingShiftKey) {
            setContainerHasFocus(true);
            const selectionAreaClone = deepCloneObject(selectionAreas);
            const indexOfItemToUpdate = selectionAreaClone.findIndex(
              (item) => item.matcher === currentMatcher
            );

            if (indexOfItemToUpdate === -1) {
              // There is always a selectionArea with a point1 object that updates
              // whenever the activeCellCoordinates update, we should always be able
              // to find an index, but if we do not for some reason we should return
              // at this point.
              return;
            } else {
              // Update the selectionArea that was found, do not update currentMatcher
              selectionAreaClone[indexOfItemToUpdate].point1 =
                activeCellCoordinates;
              selectionAreaClone[indexOfItemToUpdate].point2 =
                activeCoordinates;
              selectionAreaClone[indexOfItemToUpdate].areaCreated = false;
              selectionAreaClone[indexOfItemToUpdate].matcher = currentMatcher;
              setSelectionAreas(selectionAreaClone);
            }
          } else {
            setActiveCellCoordinates(activeCoordinates);
            // remove all previous cell selections
            removeCellSelections({ spreadsheetRef: ref });
            setSelectionAreas([
              { point1: activeCoordinates, matcher: tempMatcher },
            ]);
            setCurrentMatcher(tempMatcher);
            setSelectionAreaData([]);
          }
        };
      },
      [
        currentMatcher,
        activeCellCoordinates,
        selectionAreas,
        setActiveCellCoordinates,
        setSelectionAreas,
        setContainerHasFocus,
        setClickAndHoldActive,
        setCurrentMatcher,
        ref,
        setSelectionAreaData,
      ]
    );

    const handleBodyCellHover = useCallback(
      (cell, columnIndex) => {
        return () => {
          if (clickAndHoldActive) {
            const cellCoordinates = {
              row: cell.row.index,
              column: columnIndex,
            };
            setSelectionAreas((prev) => {
              const selectionAreaClone = deepCloneObject(prev);
              const indexOfItemToUpdate = selectionAreaClone.findIndex(
                (item) => item.matcher === currentMatcher
              );
              // No items in the array match up with the currentMatcher value
              if (indexOfItemToUpdate === -1) {
                return prev;
              }
              // Do not update state if you're still hovering on the same cell
              if (
                selectionAreaClone[indexOfItemToUpdate].point2?.row ===
                  cellCoordinates.row &&
                selectionAreaClone[indexOfItemToUpdate].point2?.column ===
                  cellCoordinates.column
              ) {
                return prev;
              }
              selectionAreaClone[indexOfItemToUpdate].point2 = cellCoordinates;
              selectionAreaClone[indexOfItemToUpdate].areaCreated = false;
              return selectionAreaClone;
            });
          }
        };
      },
      [clickAndHoldActive, currentMatcher, setSelectionAreas]
    );

    const handleRowHeaderClick = useCallback(
      (index) => {
        return () => {
          handleHeaderCellSelection({
            type: 'row',
            activeCellCoordinates,
            rows,
            columns,
            setActiveCellCoordinates,
            setCurrentMatcher,
            setSelectionAreas,
            spreadsheetRef: ref,
            index,
            setSelectionAreaData,
          });
        };
      },
      [
        columns,
        ref,
        setSelectionAreas,
        setCurrentMatcher,
        setActiveCellCoordinates,
        activeCellCoordinates,
        rows,
        setSelectionAreaData,
      ]
    );

    // Renders each row/cell in the spreadsheet body
    const RenderRow = useCallback(
      ({ index, style }) => {
        const row = rows[index];
        prepareRow(row);
        return (
          <div
            {...row.getRowProps({ style })}
            className={cx(`${blockClass}__tr`)}
            data-row-index={index}
          >
            {/* ROW HEADER BUTTON */}
            <button
              tabIndex={-1}
              data-row-index={index}
              data-column-index="header"
              type="button"
              onClick={handleRowHeaderClick(index)}
              className={cx(
                `${blockClass}__td`,
                `${blockClass}__td-th`,
                `${blockClass}--interactive-cell-element`,
                {
                  [`${blockClass}__td-th--active-header`]:
                    activeCellCoordinates?.row === index ||
                    checkActiveHeaderCell(index, selectionAreas, 'row'),
                }
              )}
              style={{
                width: defaultColumn?.rowHeaderWidth,
              }}
            >
              {index + 1}
            </button>
            {/* CELL BUTTONS */}
            {row.cells.map((cell, index) => (
              <button
                tabIndex={-1}
                data-row-index={cell.row.index}
                data-column-index={index}
                {...cell.getCellProps()}
                className={cx(
                  `${blockClass}__td`,
                  `${blockClass}__body--td`,
                  `${blockClass}--interactive-cell-element`
                )}
                key={`cell_${index}`}
                onMouseDown={handleBodyCellClick(cell, index)}
                onMouseOver={handleBodyCellHover(cell, index)}
                onFocus={() => {}}
                type="button"
              >
                {cell.render('Cell')}
              </button>
            ))}
          </div>
        );
      },
      [
        prepareRow,
        rows,
        defaultColumn.rowHeaderWidth,
        activeCellCoordinates?.row,
        selectionAreas,
        handleRowHeaderClick,
        handleBodyCellClick,
        handleBodyCellHover,
      ]
    );

    const spreadsheetBodyRef = useRef();
    return (
      <div
        ref={spreadsheetBodyRef}
        className={cx(`${blockClass}__body--container`)}
        {...getTableBodyProps()}
      >
        <FixedSizeList
          className={cx(
            `${blockClass}__list--container`,
            `${blockClass}__list--container--${id}`
          )}
          height={400}
          itemCount={rows.length}
          itemSize={defaultColumn?.rowHeight}
          width={totalColumnsWidth + scrollBarSize}
        >
          {RenderRow}
        </FixedSizeList>
      </div>
    );
  }
);

DataSpreadsheetBody.propTypes = {
  /**
   * Object containing the active cell coordinates
   */
  activeCellCoordinates: PropTypes.shape({
    row: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    column: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  }),

  /**
   * Is the user clicking and holding in the data spreadsheet body
   */
  clickAndHoldActive: PropTypes.bool,

  /**
   * All of the spreadsheet columns
   */
  columns: PropTypes.array,

  /**
   * This represents the id of the current cell selection area
   */
  currentMatcher: PropTypes.string,

  /**
   * Default spreadsheet sizing values
   */
  defaultColumn: PropTypes.shape({
    rowHeight: PropTypes.number,
    rowHeaderWidth: PropTypes.number,
    width: PropTypes.number,
  }),

  /**
   * Function to set table body prop values
   */
  getTableBodyProps: PropTypes.func,

  /**
   * The spreadsheet id
   */
  id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),

  /**
   * The event handler that is called when the active cell changes
   */
  onActiveCellChange: PropTypes.func,

  /**
   * The event handler that is called when the selection areas change
   */
  onSelectionAreaChange: PropTypes.func,

  /**
   * Prepare row function from react-table
   */
  prepareRow: PropTypes.func,

  /**
   * All of the spreadsheet row data
   */
  rows: PropTypes.arrayOf(PropTypes.object),

  /**
   * The scrollbar width
   */
  scrollBarSize: PropTypes.number,

  /**
   * Array of selection area data
   */
  selectionAreaData: PropTypes.array,

  /**
   * Array of selection areas
   */
  selectionAreas: PropTypes.array,

  /**
   * Setter fn for activeCellCoordinates state value
   */
  setActiveCellCoordinates: PropTypes.func,

  /**
   * Setter fn for clickAndHold state value
   */
  setClickAndHoldActive: PropTypes.func,

  /**
   * Setter fn for containerHasFocus state value
   */
  setContainerHasFocus: PropTypes.func,

  /**
   * Setter fn for currentMatcher state value
   */
  setCurrentMatcher: PropTypes.func,

  /**
   * Setter fn for selectionAreaData state value
   */
  setSelectionAreaData: PropTypes.func,

  /**
   * Setter fn for selectionAreas state value
   */
  setSelectionAreas: PropTypes.func,

  /**
   * The total columns width
   */
  totalColumnsWidth: PropTypes.number,
};
