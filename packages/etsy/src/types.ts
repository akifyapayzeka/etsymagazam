/** Minimal, hand-verified subset of the Etsy Open API v3 response/request shapes we actually use. */

export interface EtsyShop {
  shop_id: number;
  shop_name: string;
  currency_code: string;
  listing_active_count: number;
  is_vacation: boolean;
}

export interface CreateDraftListingInput {
  quantity: number;
  title: string;
  description: string;
  price: number; // major currency unit, e.g. 4.99
  who_made: "i_did" | "someone_else" | "collective";
  when_made: string; // e.g. "made_to_order"
  taxonomy_id: number;
  tags?: string[];
  materials?: string[];
  shipping_profile_id?: number;
  is_digital: true;
  is_personalizable?: boolean;
  should_auto_renew?: boolean;
  is_supply?: boolean;
  state?: "draft" | "active";
  style?: string[];
}

export interface EtsyListing {
  listing_id: number;
  shop_id: number;
  title: string;
  description: string;
  state: "active" | "draft" | "inactive" | "sold_out" | "expired" | "removed";
  price: { amount: number; divisor: number; currency_code: string };
  quantity: number;
  tags: string[];
  taxonomy_id: number;
  is_digital: boolean;
  url: string;
  created_timestamp: number;
  last_modified_timestamp: number;
}

export interface UpdateListingInput {
  title?: string;
  description?: string;
  price?: number;
  tags?: string[];
  materials?: string[];
  taxonomy_id?: number;
  state?: "active" | "inactive" | "draft";
  quantity?: number;
}

export interface EtsyListingImage {
  listing_image_id: number;
  listing_id: number;
  rank: number;
  url_fullxfull: string;
}

export interface EtsyListingFile {
  listing_file_id: number;
  listing_id: number;
  rank: number;
  filename: string;
  size: number;
}

export interface EtsyReceipt {
  receipt_id: number;
  shop_id: number;
  buyer_user_id: number;
  status: string;
  is_paid: boolean;
  is_shipped: boolean;
  grandtotal: { amount: number; divisor: number; currency_code: string };
  created_timestamp: number;
  transactions?: EtsyReceiptTransaction[];
}

export interface EtsyReceiptTransaction {
  transaction_id: number;
  listing_id: number;
  quantity: number;
  price: { amount: number; divisor: number; currency_code: string };
}

export interface EtsyPaginatedResponse<T> {
  count: number;
  results: T[];
}

export interface EtsyErrorResponse {
  error?: string;
  error_description?: string;
  message?: string;
}
