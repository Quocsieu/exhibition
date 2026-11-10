import type {
  Booth,
  CreateBoothInput,
  UpdateBoothInput,
  Product,
  CreateProductInput,
  UpdateProductInput,
  ExtractedProductDraft,
} from '../schemas/expoSchemas.js';
import type { ExpoDatabase } from '../database/db.js';
import {
  fetchExternalProductHtml,
  extractProductFromHtml,
  parseBatchProducts,
} from '../integrations/productAdapter.js';

export class ExpoService {
  constructor(private readonly db: ExpoDatabase) {}

  listBooths(): Booth[] {
    return this.db.listBooths();
  }

  getBoothById(id: string): Booth | null {
    return this.db.getBoothById(id);
  }

  createBooth(input: CreateBoothInput): Booth {
    return this.db.createBooth(input);
  }

  updateBooth(id: string, input: UpdateBoothInput): Booth | null {
    return this.db.updateBooth(id, input);
  }

  deleteBooth(id: string): boolean {
    return this.db.deleteBooth(id);
  }

  listProducts(boothId?: string): Product[] {
    return this.db.listProducts(boothId);
  }

  getProductById(id: string): Product | null {
    return this.db.getProductById(id);
  }

  createProduct(input: CreateProductInput): Product {
    return this.db.createProduct(input);
  }

  updateProduct(id: string, input: UpdateProductInput): Product | null {
    return this.db.updateProduct(id, input);
  }

  deleteProduct(id: string): boolean {
    return this.db.deleteProduct(id);
  }

  async extractFromExternalUrl(url: string): Promise<ExtractedProductDraft> {
    const { html, finalUrl } = await fetchExternalProductHtml(url);
    return extractProductFromHtml(html, finalUrl);
  }

  importBatchProducts(
    boothId: string,
    format: 'json' | 'csv',
    content: string
  ): Product[] {
    const items = parseBatchProducts(boothId, format, content);
    return items.map((item) => this.db.createProduct(item));
  }
}
