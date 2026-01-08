
import { unserialize } from "php-serialize";

/**
 * Normalize WordPress MegaMenu items into a structured tree
 * @param {Array} items - raw WP menu items from REST API
 * @returns {Array} - nested, simplified menu
 */
export function normalizeMenu(items) {
  const map = {};
  const roots = [];

  items.forEach((item) => {
    let megamenu = null;

    // parse _megamenu if exists
    if (item.meta && item.meta._megamenu && item.meta._megamenu[0]) {
      try {
        megamenu = unserialize(item.meta._megamenu[0]);
      } catch (err) {
        console.warn("Failed to parse _megamenu for item", item.id);
      }
    }

    map[item.id] = {
      id: item.id,
      title: item.title,
      url: item.url,
      order: item.order,
      parent: item.parent,
      columns: megamenu?.columns || null, // optional grid info
      children: [],
    };
  });

  // attach children
  Object.values(map).forEach((item) => {
    if (item.parent && map[item.parent]) {
      map[item.parent].children.push(item);
    } else if (!item.parent) {
      roots.push(item);
    }
  });

  // sort by order
  function sortRecursive(arr) {
    arr.sort((a, b) => a.order - b.order);
    arr.forEach((item) => {
      if (item.children.length > 0) sortRecursive(item.children);
    });
  }

  sortRecursive(roots);

  return roots;
}
