import ColumnTable from '../table/column-table';
import error from '../util/error';

/**
 * Options for Apache Arrow import.
 * @typedef {Object} ArrowOptions
 * @property {string[]} [columns] Ordered list of column names to import.
 * @property {boolean} [unpack=false] Flag to unpack binary-encoded Arrow
 *  data to standard JavaScript values. Unpacking can incur an upfront time
 *  and memory cost to extract data to new arrays, but can speed up later
 *  query processing by enabling faster data access.
 */

/**
 * Create a new table backed by an Apache Arrow table instance.
 * @param {Object} arrowTable An Apache Arrow data table.
 * @param {ArrowOptions} options Options for Arrow import.
 * @param {ColumnTable} table A new table containing the imported values.
 */
export default function(arrowTable, options = {}) {
  const columns = {};

  const names = options.columns || arrowTable.schema.fields.map(f => f.name);
  const unpack = !!options.unpack;

  names.forEach(name => {
    const column = arrowTable.getColumn(name);
    if (column == null) {
      error(`Arrow column does not exist: ${JSON.stringify(name)}`);
    }
    columns[name] = unpack ? arrayFromArrow(column) : column;
  });

  return new ColumnTable(columns);
}

function arrayFromArrow(column) {
  if (column.dictionary) {
    return unpackDictionary(column);
  }
  // if has null values, extract to standard array
  return column.nullCount > 0 ? [...column] : column.toArray();
}

function unpackDictionary(column) {
  // Only decode utf-8 once per dictionary key, rather than once per occurrence.
  // column -- an arrow column Dictionary vector.
  const values = new Array(column.length);
  // Use the last chunk in case the dictionary builds as it goes.
  const ks = column.chunks[column.chunks.length-1].dictionary.toArray();
  let i = 0;
  for (const chunk of column.chunks) {
    const nullmap = chunk.nullBitmap || [];
    for (let j=0; j < chunk.data.length; j++) {
      const ix = chunk.data.values[j];
      // ix >> 3 advances the byte every 8 bits; 
      // (1 << (ix % 8) checks if relevant the bit is set in that byte.
      if (nullmap.length && !(nullmap[j >> 3] & (1 << (j % 8)))) {
        values[i] = null;
      } else {
        values[i] = ks[ix];
      }
      i++;
    }
  }
  return values;
}
