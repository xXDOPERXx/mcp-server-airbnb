#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
  McpError,
  ErrorCode,
} from "@modelcontextprotocol/sdk/types.js";
import fetch from "node-fetch";
import * as cheerio from "cheerio";
// We'll implement a simple robots.txt parser ourselves

// Interfaces for Airbnb data
interface AirbnbSearchResult {
  id: string;
  name: string;
  url: string;
  type: string;
  location: string;
  price: string;
  rating?: string;
  reviewCount?: string;
  superhost: boolean;
  amenities: string[];
  imageUrl?: string;
}

interface AirbnbListingDetails {
  id: string;
  name: string;
  description: string;
  host: {
    name: string;
    isSuperhost: boolean;
    joinDate?: string;
    profileUrl?: string;
  };
  location: {
    address: string;
    coordinates?: {
      latitude?: number;
      longitude?: number;
    };
  };
  details: {
    guests: string;
    bedrooms: string;
    beds: string;
    baths: string;
  };
  amenities: string[];
  pricing: {
    basePrice: string;
    cleaningFee?: string;
    serviceFee?: string;
    total?: string;
  };
  availability?: string[];
  reviews?: {
    rating: string;
    count: string;
    highlights: string[];
  };
  rules?: string[];
  cancellationPolicy?: string;
}

// Tool definitions
const AIRBNB_SEARCH_TOOL: Tool = {
  name: "airbnb_search",
  description: "Search for Airbnb listings",
  inputSchema: {
    type: "object",
    properties: {
      location: {
        type: "string",
        description: "Location to search for (city, address, etc.)"
      },
      checkin: {
        type: "string",
        description: "Check-in date (YYYY-MM-DD)"
      },
      checkout: {
        type: "string",
        description: "Check-out date (YYYY-MM-DD)"
      },
      adults: {
        type: "number",
        description: "Number of adults"
      },
      children: {
        type: "number",
        description: "Number of children"
      },
      infants: {
        type: "number",
        description: "Number of infants"
      },
      pets: {
        type: "number",
        description: "Number of pets"
      },
      minPrice: {
        type: "number",
        description: "Minimum price per night"
      },
      maxPrice: {
        type: "number",
        description: "Maximum price per night"
      },
      roomType: {
        type: "string",
        description: "Type of place (entire home, private room, etc.)"
      }
    },
    required: ["location"]
  }
};

const AIRBNB_LISTING_DETAILS_TOOL: Tool = {
  name: "airbnb_listing_details",
  description: "Get detailed information about a specific Airbnb listing",
  inputSchema: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description: "The Airbnb listing ID"
      },
      checkin: {
        type: "string",
        description: "Check-in date (YYYY-MM-DD)"
      },
      checkout: {
        type: "string",
        description: "Check-out date (YYYY-MM-DD)"
      },
      adults: {
        type: "number",
        description: "Number of adults"
      },
      children: {
        type: "number",
        description: "Number of children"
      },
      infants: {
        type: "number",
        description: "Number of infants"
      },
      pets: {
        type: "number",
        description: "Number of pets"
      }
    },
    required: ["id"]
  }
};

const AIRBNB_TOOLS = [
  AIRBNB_SEARCH_TOOL,
  AIRBNB_LISTING_DETAILS_TOOL,
] as const;

// Utility functions
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36";
const BASE_URL = "https://www.airbnb.com";
let robotsTxtContent = "";

// Simple robots.txt parser
async function fetchRobotsTxt() {
  try {
    const response = await fetch(`${BASE_URL}/robots.txt`);
    robotsTxtContent = await response.text();
  } catch (error) {
    console.error("Error fetching robots.txt:", error);
    robotsTxtContent = ""; // Empty robots.txt means everything is allowed
  }
}

function isPathAllowed(path: string) {
  if (!robotsTxtContent) {
    return true; // If we couldn't fetch robots.txt, assume allowed
  }
  
  // Simple robots.txt parsing
  const lines = robotsTxtContent.split('\n');
  let userAgentSection = false;
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // Skip comments and empty lines
    if (trimmedLine.startsWith('#') || trimmedLine === '') {
      continue;
    }
    
    // Check if we're in the right user-agent section
    if (trimmedLine.toLowerCase().startsWith('user-agent:')) {
      const agent = trimmedLine.substring(11).trim();
      userAgentSection = agent === '*' || USER_AGENT.includes(agent);
      continue;
    }
    
    // If we're in the right section, check for disallow rules
    if (userAgentSection && trimmedLine.toLowerCase().startsWith('disallow:')) {
      const disallowedPath = trimmedLine.substring(9).trim();
      if (disallowedPath && path.startsWith(disallowedPath)) {
        return false;
      }
    }
  }
  
  return true;
}

async function fetchWithUserAgent(url: string) {
  return fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
}

// API handlers
async function handleAirbnbSearch(params: any) {
  const {
    location,
    checkin,
    checkout,
    adults = 1,
    children = 0,
    infants = 0,
    pets = 0,
    minPrice,
    maxPrice,
    roomType,
  } = params;

  // Build search URL
  const searchUrl = new URL(`${BASE_URL}/s/${encodeURIComponent(location)}/homes`);
  
  // Add query parameters
  if (checkin) searchUrl.searchParams.append("checkin", checkin);
  if (checkout) searchUrl.searchParams.append("checkout", checkout);
  
  // Add guests
  const adults_int = parseInt(adults.toString());
  const children_int = parseInt(children.toString());
  const infants_int = parseInt(infants.toString());
  const pets_int = parseInt(pets.toString());
  
  const totalGuests = adults_int + children_int;
  if (totalGuests > 0) {
    searchUrl.searchParams.append("adults", adults_int.toString());
    searchUrl.searchParams.append("children", children_int.toString());
    searchUrl.searchParams.append("infants", infants_int.toString());
    searchUrl.searchParams.append("pets", pets_int.toString());
  }
  
  // Add price range
  if (minPrice) searchUrl.searchParams.append("price_min", minPrice.toString());
  if (maxPrice) searchUrl.searchParams.append("price_max", maxPrice.toString());
  
  // Add room type
  if (roomType) {
    const roomTypeParam = roomType.toLowerCase().replace(/\s+/g, '_');
    searchUrl.searchParams.append("room_types[]", roomTypeParam);
  }

  // Check if path is allowed by robots.txt
  const path = searchUrl.pathname + searchUrl.search;
  if (!isPathAllowed(path)) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          error: "This path is disallowed by Airbnb's robots.txt",
          url: searchUrl.toString()
        }, null, 2)
      }],
      isError: true
    };
  }

  try {
    const response = await fetchWithUserAgent(searchUrl.toString());
    const html = await response.text();
    const $ = cheerio.load(html);
    
    // Extract search results
    const listings: AirbnbSearchResult[] = [];
    
    // Find listing cards
    $('div[data-testid="card-container"]').each((i, element) => {
      const listing: AirbnbSearchResult = {
        id: "",
        name: "",
        url: "",
        type: "",
        location: "",
        price: "",
        superhost: false,
        amenities: []
      };
      
      // Extract listing ID and URL
      const linkElement = $(element).find('a[data-testid="card-link"]');
      const href = linkElement.attr('href');
      if (href) {
        listing.url = href.startsWith('/') ? `${BASE_URL}${href}` : href;
        // Extract ID from URL
        const idMatch = href.match(/\/rooms\/(\d+)/);
        if (idMatch && idMatch[1]) {
          listing.id = idMatch[1];
        }
      }
      
      // Extract listing name
      const titleElement = $(element).find('div[data-testid="listing-card-title"]');
      listing.name = titleElement.text().trim();
      
      // Extract listing type and location
      const subtitleElement = $(element).find('span[data-testid="listing-card-subtitle"]');
      const subtitleText = subtitleElement.text().trim();
      const subtitleParts = subtitleText.split(' in ');
      if (subtitleParts.length >= 2) {
        listing.type = subtitleParts[0].trim();
        listing.location = subtitleParts[1].trim();
      } else {
        listing.type = subtitleText;
      }
      
      // Extract price
      const priceElement = $(element).find('span[data-testid="price-element"]');
      listing.price = priceElement.text().trim();
      
      // Extract rating and review count
      const reviewElement = $(element).find('span[data-testid="listing-card-rating"]');
      const reviewText = reviewElement.text().trim();
      const ratingMatch = reviewText.match(/([\d.]+)/);
      if (ratingMatch) {
        listing.rating = ratingMatch[1];
        const reviewCountMatch = reviewText.match(/\((\d+)\)/);
        if (reviewCountMatch) {
          listing.reviewCount = reviewCountMatch[1];
        }
      }
      
      // Check if superhost
      const superhostElement = $(element).find('div:contains("Superhost")');
      listing.superhost = superhostElement.length > 0;
      
      // Extract image URL
      const imgElement = $(element).find('img');
      if (imgElement.length > 0) {
        listing.imageUrl = imgElement.attr('src');
      }
      
      // Extract amenities
      const amenitiesElement = $(element).find('div[data-testid="listing-card-amenities"]');
      amenitiesElement.find('span').each((i, amenityElement) => {
        const amenity = $(amenityElement).text().trim();
        if (amenity) {
          listing.amenities.push(amenity);
        }
      });
      
      listings.push(listing);
    });

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          searchUrl: searchUrl.toString(),
          results: listings
        }, null, 2)
      }],
      isError: false
    };
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
          searchUrl: searchUrl.toString()
        }, null, 2)
      }],
      isError: true
    };
  }
}

async function handleAirbnbListingDetails(params: any) {
  const {
    id,
    checkin,
    checkout,
    adults = 1,
    children = 0,
    infants = 0,
    pets = 0
  } = params;

  // Build listing URL
  const listingUrl = new URL(`${BASE_URL}/rooms/${id}`);
  
  // Add query parameters
  if (checkin) listingUrl.searchParams.append("checkin", checkin);
  if (checkout) listingUrl.searchParams.append("checkout", checkout);
  
  // Add guests
  const adults_int = parseInt(adults.toString());
  const children_int = parseInt(children.toString());
  const infants_int = parseInt(infants.toString());
  const pets_int = parseInt(pets.toString());
  
  const totalGuests = adults_int + children_int;
  if (totalGuests > 0) {
    listingUrl.searchParams.append("adults", adults_int.toString());
    listingUrl.searchParams.append("children", children_int.toString());
    listingUrl.searchParams.append("infants", infants_int.toString());
    listingUrl.searchParams.append("pets", pets_int.toString());
  }

  // Check if path is allowed by robots.txt
  const path = listingUrl.pathname + listingUrl.search;
  if (!isPathAllowed(path)) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          error: "This path is disallowed by Airbnb's robots.txt",
          url: listingUrl.toString()
        }, null, 2)
      }],
      isError: true
    };
  }

  try {
    const response = await fetchWithUserAgent(listingUrl.toString());
    const html = await response.text();
    const $ = cheerio.load(html);
    
    // Extract listing details
    const listing: AirbnbListingDetails = {
      id,
      name: "",
      description: "",
      host: {
        name: "",
        isSuperhost: false
      },
      location: {
        address: ""
      },
      details: {
        guests: "",
        bedrooms: "",
        beds: "",
        baths: ""
      },
      amenities: [],
      pricing: {
        basePrice: ""
      }
    };
    
    // Extract listing name
    const titleElement = $('h1[data-testid="listing-title"]');
    listing.name = titleElement.text().trim();
    
    // Extract description
    const descriptionElement = $('div[data-testid="listing-description"]');
    listing.description = descriptionElement.text().trim();
    
    // Extract host information
    const hostNameElement = $('div[data-testid="host-name"]');
    listing.host.name = hostNameElement.text().trim().replace('Hosted by ', '');
    
    const superhostElement = $('div:contains("Superhost")');
    listing.host.isSuperhost = superhostElement.length > 0;
    
    const hostJoinDateElement = $('div:contains("Joined in")');
    if (hostJoinDateElement.length > 0) {
      listing.host.joinDate = hostJoinDateElement.text().trim();
    }
    
    // Extract location
    const addressElement = $('div[data-testid="listing-address"]');
    listing.location.address = addressElement.text().trim();
    
    // Try to extract coordinates from any map links or data attributes
    const mapElement = $('[data-lat][data-lng]');
    if (mapElement.length > 0) {
      const lat = mapElement.attr('data-lat');
      const lng = mapElement.attr('data-lng');
      if (lat && lng) {
        listing.location.coordinates = {
          latitude: parseFloat(lat),
          longitude: parseFloat(lng)
        };
      }
    }
    
    // Extract details (guests, bedrooms, etc.)
    const detailsElement = $('div[data-testid="listing-details"]');
    const detailsText = detailsElement.text().trim();
    
    const guestsMatch = detailsText.match(/(\d+)\s+guests?/i);
    if (guestsMatch) listing.details.guests = guestsMatch[1];
    
    const bedroomsMatch = detailsText.match(/(\d+)\s+bedrooms?/i);
    if (bedroomsMatch) listing.details.bedrooms = bedroomsMatch[1];
    
    const bedsMatch = detailsText.match(/(\d+)\s+beds?/i);
    if (bedsMatch) listing.details.beds = bedsMatch[1];
    
    const bathsMatch = detailsText.match(/([\d.]+)\s+baths?/i);
    if (bathsMatch) listing.details.baths = bathsMatch[1];
    
    // Extract amenities
    const amenitiesSection = $('div[data-testid="listing-amenities-section"]');
    amenitiesSection.find('div[data-testid="amenity-row"]').each((i, element) => {
      const amenity = $(element).text().trim();
      if (amenity) {
        listing.amenities.push(amenity);
      }
    });
    
    // Extract pricing
    const priceElement = $('div[data-testid="price-element"]');
    listing.pricing.basePrice = priceElement.text().trim();
    
    const cleaningFeeElement = $('div:contains("Cleaning fee")').next();
    if (cleaningFeeElement.length > 0) {
      listing.pricing.cleaningFee = cleaningFeeElement.text().trim();
    }
    
    const serviceFeeElement = $('div:contains("Service fee")').next();
    if (serviceFeeElement.length > 0) {
      listing.pricing.serviceFee = serviceFeeElement.text().trim();
    }
    
    const totalElement = $('div:contains("Total")').next();
    if (totalElement.length > 0) {
      listing.pricing.total = totalElement.text().trim();
    }
    
    // Extract reviews
    const ratingElement = $('div[data-testid="rating"]');
    const reviewCountElement = $('div[data-testid="reviews-count"]');
    
    if (ratingElement.length > 0 && reviewCountElement.length > 0) {
      const rating = ratingElement.text().trim();
      const count = reviewCountElement.text().trim().replace(/\D/g, '');
      
      listing.reviews = {
        rating,
        count,
        highlights: []
      };
      
      // Extract review highlights
      $('div[data-testid="review-highlight"]').each((i, element) => {
        const highlight = $(element).text().trim();
        if (highlight && listing.reviews) {
          listing.reviews.highlights.push(highlight);
        }
      });
    }
    
    // Extract house rules
    const rulesSection = $('div:contains("House rules")').parent();
    if (rulesSection.length > 0) {
      listing.rules = [];
      rulesSection.find('div[role="listitem"]').each((i, element) => {
        const rule = $(element).text().trim();
        if (rule && listing.rules) {
          listing.rules.push(rule);
        }
      });
    }
    
    // Extract cancellation policy
    const cancellationElement = $('div[data-testid="cancellation-policy"]');
    if (cancellationElement.length > 0) {
      listing.cancellationPolicy = cancellationElement.text().trim();
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          listingUrl: listingUrl.toString(),
          details: listing
        }, null, 2)
      }],
      isError: false
    };
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
          listingUrl: listingUrl.toString()
        }, null, 2)
      }],
      isError: true
    };
  }
}

// Server setup
const server = new Server(
  {
    name: "mcp-server/airbnb",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Set up request handlers
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: AIRBNB_TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    // Ensure robots.txt is loaded
    if (!robotsTxtContent) {
      await fetchRobotsTxt();
    }

    switch (request.params.name) {
      case "airbnb_search": {
        return await handleAirbnbSearch(request.params.arguments);
      }

      case "airbnb_listing_details": {
        return await handleAirbnbListingDetails(request.params.arguments);
      }

      default:
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${request.params.name}`
        );
    }
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `Error: ${error instanceof Error ? error.message : String(error)}`
      }],
      isError: true
    };
  }
});

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Airbnb MCP Server running on stdio");
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
