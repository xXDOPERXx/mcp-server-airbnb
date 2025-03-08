# Airbnb MCP Server

MCP Server for Airbnb search and listing details.

## Tools

1. `airbnb_search`
   - Search for Airbnb listings
   - Required Input: `location` (string)
   - Optional Inputs:
     - `checkin` (string, YYYY-MM-DD)
     - `checkout` (string, YYYY-MM-DD)
     - `adults` (number)
     - `children` (number)
     - `infants` (number)
     - `pets` (number)
     - `minPrice` (number)
     - `maxPrice` (number)
     - `roomType` (string)
   - Returns: Array of listings with details like name, price, location, etc.

2. `airbnb_listing_details`
   - Get detailed information about a specific Airbnb listing
   - Required Input: `id` (string)
   - Optional Inputs:
     - `checkin` (string, YYYY-MM-DD)
     - `checkout` (string, YYYY-MM-DD)
     - `adults` (number)
     - `children` (number)
     - `infants` (number)
     - `pets` (number)
   - Returns: Detailed listing information including description, host details, amenities, pricing, etc.

## Features

- Respects Airbnb's robots.txt rules
- Uses cheerio for HTML parsing
- No API key required
- Returns structured JSON data

## Setup

### Usage with Claude Desktop

Add the following to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "airbnb": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-airbnb"
      ]
    }
  }
}
```

## Build

```bash
npm install
npm run build
```

## License

This MCP server is licensed under the MIT License.
