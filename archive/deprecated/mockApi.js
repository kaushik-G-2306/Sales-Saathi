import { mockData } from './mockData.js';

/**
 * Simulates a network delay
 * @param {number} ms 
 */
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Core API Client
 * Automatically falls back to mock data if real environment variables are missing.
 */
export const api = {
  getPreMeetingBriefs: async () => {
    // If VITE_OPENAI_API_KEY was present, we might hit a real endpoint here.
    // For local dev / demo, we use mock data.
    await delay(800); 
    return mockData.preMeetingBriefs;
  },
  
  getSmartIceBreakers: async () => {
    await delay(600);
    return mockData.smartIceBreakers;
  },
  
  getMeetingSummaries: async () => {
    await delay(1000);
    return mockData.meetingSummaries;
  },
  
  getDealRisk: async () => {
    await delay(700);
    return mockData.dealRisk;
  },
  
  getPipelineAnalytics: async () => {
    await delay(500);
    return mockData.pipelineAnalytics;
  }
};
