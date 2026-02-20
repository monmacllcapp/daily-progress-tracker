import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the mcp-bridge module
vi.mock('../mcp-bridge', () => ({
  mcpBridge: {
    callTool: vi.fn(),
  },
}));

import { mcpBridge } from '../mcp-bridge';
import * as googleWorkspace from '../google-workspace';
import * as realEstate from '../real-estate';
import * as zillow from '../zillow';
import * as alpaca from '../alpaca';
import * as notion from '../notion';
import * as todoist from '../todoist';
import * as pdfReader from '../pdf-reader';

const mockedCallTool = vi.mocked(mcpBridge.callTool);

describe('MCP Adapters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedCallTool.mockResolvedValue({
      success: true,
      data: {},
      duration_ms: 100,
    });
  });

  describe('Google Workspace Adapter', () => {
    it('should call correct server/tool for getCalendarEvents', async () => {
      const params = { timeMin: '2026-02-13T00:00:00Z', timeMax: '2026-02-14T00:00:00Z' };
      await googleWorkspace.getCalendarEvents(params);

      expect(mockedCallTool).toHaveBeenCalledWith({
        server: 'google-workspace',
        tool: 'calendar_events',
        arguments: params,
      });
    });

    it('should pass query params to searchGmail', async () => {
      const params = { query: 'is:unread', maxResults: 50 };
      await googleWorkspace.searchGmail(params);

      expect(mockedCallTool).toHaveBeenCalledWith({
        server: 'google-workspace',
        tool: 'gmail_search',
        arguments: params,
      });
    });

    it('should send email with correct parameters', async () => {
      await googleWorkspace.sendGmail('test@example.com', 'Test Subject', 'Test Body');

      expect(mockedCallTool).toHaveBeenCalledWith({
        server: 'google-workspace',
        tool: 'gmail_send',
        arguments: { to: 'test@example.com', subject: 'Test Subject', body: 'Test Body' },
      });
    });

    it('should search Drive with query', async () => {
      await googleWorkspace.searchDrive('quarterly report');

      expect(mockedCallTool).toHaveBeenCalledWith({
        server: 'google-workspace',
        tool: 'drive_search',
        arguments: { query: 'quarterly report' },
      });
    });
  });

  describe('Real Estate Adapter', () => {
    it('should call correct server/tool for analyzeDeal', async () => {
      const params = { address: '123 Main St', strategy: 'rental' as const };
      await realEstate.analyzeDeal(params);

      expect(mockedCallTool).toHaveBeenCalledWith({
        server: 'real-estate',
        tool: 'analyze_deal',
        arguments: params,
      });
    });

    it('should search comps with radius', async () => {
      const params = { address: '123 Main St', radius: 2, maxResults: 10 };
      await realEstate.searchComps(params);

      expect(mockedCallTool).toHaveBeenCalledWith({
        server: 'real-estate',
        tool: 'comp_search',
        arguments: params,
      });
    });

    it('should get market data for ZIP', async () => {
      const params = { zip: '94103', period: 'month' as const };
      await realEstate.getMarketData(params);

      expect(mockedCallTool).toHaveBeenCalledWith({
        server: 'real-estate',
        tool: 'market_data',
        arguments: params,
      });
    });
  });

  describe('Zillow Adapter', () => {
    it('should call correct server/tool for getZestimate', async () => {
      await zillow.getZestimate('123 Main St, San Francisco, CA');

      expect(mockedCallTool).toHaveBeenCalledWith({
        server: 'zillow',
        tool: 'zestimate',
        arguments: { address: '123 Main St, San Francisco, CA' },
      });
    });

    it('should get property details with address', async () => {
      await zillow.getPropertyDetails('456 Oak Ave');

      expect(mockedCallTool).toHaveBeenCalledWith({
        server: 'zillow',
        tool: 'property_details',
        arguments: { address: '456 Oak Ave' },
      });
    });

    it('should get price history', async () => {
      await zillow.getPriceHistory('789 Pine St');

      expect(mockedCallTool).toHaveBeenCalledWith({
        server: 'zillow',
        tool: 'price_history',
        arguments: { address: '789 Pine St' },
      });
    });
  });

  describe('Alpaca Adapter', () => {
    it('should call correct server/tool for getPortfolio', async () => {
      await alpaca.getPortfolio();

      expect(mockedCallTool).toHaveBeenCalledWith({
        server: 'alpaca',
        tool: 'get_portfolio',
        arguments: {},
      });
    });

    it('should get positions', async () => {
      await alpaca.getPositions();

      expect(mockedCallTool).toHaveBeenCalledWith({
        server: 'alpaca',
        tool: 'get_positions',
        arguments: {},
      });
    });

    it('should get account info', async () => {
      await alpaca.getAccount();

      expect(mockedCallTool).toHaveBeenCalledWith({
        server: 'alpaca',
        tool: 'get_account',
        arguments: {},
      });
    });

    it('should place order with correct params', async () => {
      const params = { symbol: 'AAPL', qty: 10, side: 'buy' as const, type: 'market' as const };
      await alpaca.placeOrder(params);

      expect(mockedCallTool).toHaveBeenCalledWith({
        server: 'alpaca',
        tool: 'place_order',
        arguments: params,
      });
    });
  });

  describe('Notion Adapter', () => {
    it('should call correct server/tool for searchPages', async () => {
      const params = { query: 'meeting notes', maxResults: 20 };
      await notion.searchPages(params);

      expect(mockedCallTool).toHaveBeenCalledWith({
        server: 'notion',
        tool: 'search_pages',
        arguments: params,
      });
    });

    it('should read page by ID', async () => {
      await notion.readPage('page-123');

      expect(mockedCallTool).toHaveBeenCalledWith({
        server: 'notion',
        tool: 'read_page',
        arguments: { pageId: 'page-123' },
      });
    });

    it('should create page with title and content', async () => {
      const params = { title: 'New Page', content: 'Page content', parentId: 'parent-123' };
      await notion.createPage(params);

      expect(mockedCallTool).toHaveBeenCalledWith({
        server: 'notion',
        tool: 'create_page',
        arguments: params,
      });
    });

    it('should update page', async () => {
      const params = { pageId: 'page-456', content: 'Updated content' };
      await notion.updatePage(params);

      expect(mockedCallTool).toHaveBeenCalledWith({
        server: 'notion',
        tool: 'update_page',
        arguments: params,
      });
    });
  });

  describe('Todoist Adapter', () => {
    it('should get tasks with filter', async () => {
      const params = { filter: 'today', projectId: 'project-123' };
      await todoist.getTasks(params);

      expect(mockedCallTool).toHaveBeenCalledWith({
        server: 'todoist',
        tool: 'get_tasks',
        arguments: params,
      });
    });

    it('should create task with priority and due date', async () => {
      const params = { content: 'New task', priority: 4 as const, dueDate: '2026-02-14' };
      await todoist.createTask(params);

      expect(mockedCallTool).toHaveBeenCalledWith({
        server: 'todoist',
        tool: 'create_task',
        arguments: params,
      });
    });

    it('should complete task by ID', async () => {
      await todoist.completeTask('task-789');

      expect(mockedCallTool).toHaveBeenCalledWith({
        server: 'todoist',
        tool: 'complete_task',
        arguments: { taskId: 'task-789' },
      });
    });
  });

  describe('PDF Reader Adapter', () => {
    it('should extract text from PDF', async () => {
      const params = { url: 'https://example.com/doc.pdf', pages: '1-5' };
      await pdfReader.extractText(params);

      expect(mockedCallTool).toHaveBeenCalledWith({
        server: 'pdf-reader',
        tool: 'extract_text',
        arguments: params,
      });
    });

    it('should extract tables from PDF', async () => {
      const params = { url: 'https://example.com/report.pdf' };
      await pdfReader.extractTables(params);

      expect(mockedCallTool).toHaveBeenCalledWith({
        server: 'pdf-reader',
        tool: 'extract_tables',
        arguments: params,
      });
    });

    it('should summarize PDF with max length', async () => {
      const params = { url: 'https://example.com/whitepaper.pdf', maxLength: 200, format: 'bullet' as const };
      await pdfReader.summarizePdf(params);

      expect(mockedCallTool).toHaveBeenCalledWith({
        server: 'pdf-reader',
        tool: 'summarize',
        arguments: params,
      });
    });
  });
});
