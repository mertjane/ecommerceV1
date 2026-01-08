# Filter API Documentation

This document describes the WooCommerce dynamic filtering API endpoints.

## Overview

The Filter API provides three main endpoints for filtering products by WooCommerce attributes:
- `pa_material` (Material)
- `pa_room-type-usage` (Room Type)
- `pa_colour` (Colour)
- `pa_finish` (Finish)

All endpoints support Redis caching with a 6-hour TTL.

---

## Endpoints

### 1. GET /api/filters/options

**Description**: Get all available filter options for all attributes.

**Query Parameters**: None

**Response Format**:
```json
{
  "success": true,
  "message": "Filter options fetched successfully",
  "meta": {},
  "data": {
    "material": [
      {
        "id": 123,
        "name": "Porcelain",
        "slug": "porcelain",
        "count": 45
      },
      {
        "id": 124,
        "name": "Natural Stone",
        "slug": "natural-stone",
        "count": 30
      }
    ],
    "roomType": [
      {
        "id": 125,
        "name": "Bathroom",
        "slug": "bathroom",
        "count": 50
      }
    ],
    "colour": [
      {
        "id": 126,
        "name": "White",
        "slug": "white",
        "count": 40
      }
    ],
    "finish": [
      {
        "id": 127,
        "name": "Matt",
        "slug": "matt",
        "count": 35
      }
    ]
  }
}
```

**Postman Test**:
```
GET http://localhost:5000/api/filters/options
```

---

### 2. GET /api/filters/products

**Description**: Get filtered products based on query parameters.

**Query Parameters**:
| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `page` | number | No | Page number (default: 1) | `1` |
| `per_page` | number | No | Items per page (default: 12) | `12` |
| `category` | string/number | No | Category ID or slug | `tiles` |
| `material` | string | No | Material slug (pa_material) | `porcelain` |
| `roomType` | string | No | Room type slug (pa_room-type-usage) | `bathroom` |
| `colour` | string | No | Colour slug (pa_colour) | `white` |
| `finish` | string | No | Finish slug (pa_finish) | `matt` |
| `search` | string | No | Search keyword | `marble` |
| `min_price` | number | No | Minimum price | `10` |
| `max_price` | number | No | Maximum price | `100` |
| `orderby` | string | No | Sort by (date, price, title) | `date` |
| `order` | string | No | Sort order (asc, desc) | `desc` |

**Response Format**:
```json
{
  "success": true,
  "message": "Filtered products fetched successfully",
  "meta": {
    "current_page": 1,
    "per_page": 12,
    "total_pages": 5,
    "total_products": 58,
    "has_next_page": true,
    "has_prev_page": false
  },
  "data": [
    {
      "id": 123,
      "name": "White Porcelain Tile",
      "slug": "white-porcelain-tile",
      "price": "25.99",
      "regular_price": "29.99",
      "sale_price": "25.99",
      "price_html": "<span class='price'>£25.99</span>",
      "images": [...],
      "attributes": [
        {
          "id": 1,
          "name": "pa_material",
          "slug": "pa_material",
          "options": ["Porcelain"]
        },
        {
          "id": 2,
          "name": "pa_colour",
          "slug": "pa_colour",
          "options": ["White"]
        }
      ]
    }
  ]
}
```

**Postman Tests**:

1. **Get all products (no filters)**:
```
GET http://localhost:5000/api/filters/products
```

2. **Filter by material only**:
```
GET http://localhost:5000/api/filters/products?material=porcelain
```

3. **Filter by multiple attributes**:
```
GET http://localhost:5000/api/filters/products?material=porcelain&colour=white&finish=matt
```

4. **Filter by material and room type**:
```
GET http://localhost:5000/api/filters/products?material=natural-stone&roomType=bathroom
```

5. **Filter with pagination**:
```
GET http://localhost:5000/api/filters/products?material=porcelain&page=2&per_page=20
```

6. **Filter with price range**:
```
GET http://localhost:5000/api/filters/products?min_price=20&max_price=50
```

7. **Filter with search**:
```
GET http://localhost:5000/api/filters/products?search=marble&material=natural-stone
```

8. **Filter by category and material**:
```
GET http://localhost:5000/api/filters/products?category=tiles&material=porcelain
```

9. **Combined filters with sorting**:
```
GET http://localhost:5000/api/filters/products?material=porcelain&colour=white&orderby=price&order=asc
```

---

### 3. GET /api/filters/dynamic-options

**Description**: Get available filter options based on current filter selections. This endpoint returns dynamic filter values that update based on what filters are already applied, showing only options that will return results.

**Query Parameters**:
| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `category` | string/number | No | Category ID or slug | `tiles` |
| `material` | string | No | Material slug | `porcelain` |
| `roomType` | string | No | Room type slug | `bathroom` |
| `colour` | string | No | Colour slug | `white` |
| `finish` | string | No | Finish slug | `matt` |

**Response Format**:
```json
{
  "success": true,
  "message": "Dynamic filter options fetched successfully",
  "meta": {},
  "data": {
    "material": [
      {
        "name": "Porcelain",
        "slug": "porcelain",
        "count": 15
      }
    ],
    "roomType": [
      {
        "name": "Bathroom",
        "slug": "bathroom",
        "count": 10
      }
    ],
    "colour": [
      {
        "name": "White",
        "slug": "white",
        "count": 8
      }
    ],
    "finish": [
      {
        "name": "Matt",
        "slug": "matt",
        "count": 12
      }
    ]
  }
}
```

**Postman Tests**:

1. **Get all dynamic options (no filters applied)**:
```
GET http://localhost:5000/api/filters/dynamic-options
```

2. **Get options when material is selected**:
```
GET http://localhost:5000/api/filters/dynamic-options?material=porcelain
```

3. **Get options for category + material**:
```
GET http://localhost:5000/api/filters/dynamic-options?category=tiles&material=porcelain
```

4. **Get options for multiple filters**:
```
GET http://localhost:5000/api/filters/dynamic-options?material=porcelain&colour=white
```

---

## WooCommerce Attribute Mapping

The API uses the following WooCommerce attribute slugs:

| Frontend Key | WooCommerce Attribute | Example Values |
|--------------|----------------------|----------------|
| `material` | `pa_material` | porcelain, natural-stone, ceramic |
| `roomType` | `pa_room-type-usage` | bathroom, kitchen, living-room |
| `colour` | `pa_colour` | white, black, beige, grey |
| `finish` | `pa_finish` | matt, gloss, polished |

---

## Caching

All endpoints use Redis caching with a 6-hour TTL (21,600 seconds).

Cache keys follow this pattern:
- Filter options: `filter:options`
- Filtered products: `products:filtered:page=1:per_page=12:category=:material=porcelain:...`
- Dynamic options: `filter:dynamic:category=:material=porcelain:roomType=:colour=:finish=`

Cache hits are logged with `[CACHE HIT]` and misses with `[CACHE MISS]` in the console.

---

## Error Handling

All endpoints return standardized error responses:

```json
{
  "success": false,
  "message": "Failed to fetch filtered products",
  "error": "Error message details"
}
```

Common HTTP status codes:
- `200`: Success
- `500`: Server error (WooCommerce API error, Redis error, etc.)

---

## Testing Flow

### Recommended Testing Order:

1. **Test filter options endpoint** - Verify all attributes are returned
```
GET /api/filters/options
```

2. **Test basic product filtering** - Apply single filter
```
GET /api/filters/products?material=porcelain
```

3. **Test multiple filters** - Combine multiple attributes
```
GET /api/filters/products?material=porcelain&colour=white
```

4. **Test dynamic options** - See how options change with filters
```
GET /api/filters/dynamic-options?material=porcelain
```

5. **Test pagination** - Verify pagination works with filters
```
GET /api/filters/products?material=porcelain&page=2&per_page=10
```

6. **Test price filtering** - Add price range filters
```
GET /api/filters/products?material=porcelain&min_price=20&max_price=100
```

7. **Test search + filters** - Combine search with filters
```
GET /api/filters/products?search=tile&material=porcelain
```

---

## Postman Collection Import

You can create a Postman collection with the following structure:

```
Filter API
├── Get Filter Options
│   GET http://localhost:5000/api/filters/options
│
├── Get Filtered Products
│   ├── No Filters
│   │   GET http://localhost:5000/api/filters/products
│   ├── Filter by Material
│   │   GET http://localhost:5000/api/filters/products?material=porcelain
│   ├── Multiple Filters
│   │   GET http://localhost:5000/api/filters/products?material=porcelain&colour=white
│   ├── With Pagination
│   │   GET http://localhost:5000/api/filters/products?material=porcelain&page=2
│   └── With Price Range
│       GET http://localhost:5000/api/filters/products?min_price=20&max_price=100
│
└── Get Dynamic Options
    ├── No Filters
    │   GET http://localhost:5000/api/filters/dynamic-options
    ├── With Material
    │   GET http://localhost:5000/api/filters/dynamic-options?material=porcelain
    └── Multiple Filters
        GET http://localhost:5000/api/filters/dynamic-options?material=porcelain&colour=white
```

---

## Notes

- All attribute values should be passed as **lowercase slugs** (e.g., `porcelain`, not `Porcelain`)
- Multiple attribute filters work together (AND logic)
- The API handles both single and multiple attribute filtering
- Results are cached to improve performance
- Dynamic options endpoint is useful for building faceted search UIs
