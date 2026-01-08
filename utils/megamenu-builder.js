/**
 * Normalize a string into slug form
 */
const normalize = (str = "") =>
  str.toLowerCase().trim().replace(/\s+/g, "-");

/**
 * Find the URL of a category from WooCommerce categories
 */
const findCategoryUrl = (title, categories = []) => {
  if (!title) return null;
  const normalizedTitle = normalize(title);

  // Exact match by slug or name
  let cat = categories.find(
    (c) =>
      normalize(c.slug) === normalizedTitle ||
      c.name.toLowerCase() === title.toLowerCase()
  );
  if (cat) return cat.yoast_head_json?.og_url || null;

  // Fallback: partial slug match
  cat = categories.find((c) =>
    normalize(c.slug).includes(normalizedTitle)
  );
  return cat?.yoast_head_json?.og_url || null;
};

/**
 * Map attribute terms into menu items with links
 */
const mapTermsWithLink = (terms = [], categories = []) =>
  terms.map((term) => ({
    title: term.name,
    slug: term.slug,
    link: findCategoryUrl(term.name, categories),
  }));

/**
 * Hardcoded stone colour groups
 */
const groupStoneColours = () => [
  { title: "Whites", slug: "whites", link: null },
  { title: "Blacks", slug: "blacks", link: null },
  { title: "Greys", slug: "greys", link: null },
  { title: "Beiges & Browns", slug: "beiges-browns", link: null },
  { title: "Creams & Yellows", slug: "creams-yellows", link: null },
  { title: "Blues & Greens", slug: "blues-greens", link: null },
  { title: "Reds & Pinks", slug: "reds-pinks", link: null },
  { title: "Multicolors & Patterns", slug: "multicolors-patterns", link: null },
];

/**
 * Build the megamenu structure
 *
 * @param {Object} params
 * @param {Array} params.categories - WooCommerce categories
 * @param {Object} params.attrTermsMap - Map of attribute ID to terms
 */
export const buildMegamenu = ({ categories, attrTermsMap }) => {
  const getUrl = (title) => findCategoryUrl(title, categories);

  return [
    {
      title: "Stone Collection",
      link: getUrl("Stone Collection"),
      children: [
        {
          title: "Natural Stone Tiles",
          link: getUrl("Natural Stone Tiles"),
          children: [
            { title: "Marble Tiles", link: getUrl("Marble Tiles") },
            { title: "Limestone Tiles", link: getUrl("Limestone Tiles") },
            { title: "Stone Mosaic Tiles", link: getUrl("Stone Mosaic Tiles") },
            { title: "Travertine Tiles", link: getUrl("Travertine Tiles") },
            { title: "Slate Tiles", link: getUrl("Slate Tiles") },
            { title: "Granite Tiles", link: getUrl("Granite Tiles") },
            { title: "Clay Brick Slips", link: getUrl("Clay Brick Slips") },
          ],
        },
        {
          title: "Stone Slabs",
          link: getUrl("Stone Slabs"),
          children: [
            { title: "Bookmatch Slabs", link: getUrl("Bookmatch Slabs") },
            { title: "Slabs", link: getUrl("Slabs") },
            { title: "Vanity Tops", link: getUrl("Vanity Tops") },
            { title: "Off Cut Granite & Quartz", link: getUrl("Off Cut Granite & Quartz") },
          ]
        },
        {
          title: "Stone Colours",
          link: getUrl("Stone Colours"),
          children: groupStoneColours(attrTermsMap[6]),
        },
        {
          title: "Usage Areas",
          link: getUrl("Usage Areas"),
          children: mapTermsWithLink(attrTermsMap[8], categories),
        },
        {
          title: "Stone Finishes",
          link: getUrl("Stone Finishes"),
          children: mapTermsWithLink(attrTermsMap[2], categories),
        },
      ],
    },
    {
      title: "Custom Stonework",
      link: getUrl("Custom Stonework"),
      children: [
        { title: "Window Sills", link: getUrl("Window Sills") },
        { title: "Mouldings", link: getUrl("Mouldings") },
        { title: "Skirtings", link: getUrl("Skirtings") },
        { title: "Stone Sinks", link: getUrl("Stone Sinks") },
        { title: "Slate Hearths", link: getUrl("Slate Hearths") },
        { title: "Table Tops", link: getUrl("Table Tops") },
      ],
    },
    {
      title: "Design & Pattern Collection",
      link: getUrl("Design & Pattern Collection"),
      children: [
        { title: "Chequerboard Tiles", link: getUrl("Chequerboard Tiles") },
        { title: "Herringbone Tiles", link: getUrl("Herringbone Tiles") },
        { title: "Hexagon Tiles", link: getUrl("Hexagon Tiles") },
        { title: "Metro Tiles", link: getUrl("Metro Tiles") },
        { title: "Maxi Chequerboard Tiles", link: getUrl("Maxi Chequerboard Tiles") },
        { title: "Octagon Cabochon Tiles", link: getUrl("Octagon Cabochon Tiles") },
        { title: "Triangle Tiles", link: getUrl("Triangle Tiles") },
      ],
    },
    {
      title: "Stone Project",
      link: getUrl("Stone Project"),
      children: [
        { title: "Conventional Projects", link: getUrl("Conventional Projects") },
        { title: "Residential Projects", link: getUrl("Residential Projects") },
      ],
    },
  ];
};
