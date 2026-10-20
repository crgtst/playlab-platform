export type Role = 'customer' | 'admin' | 'support';

export interface User {
  id: number;
  email: string;
  name: string;
  role: Role;
  emailVerified: boolean;
  createdAt: string;
}

export interface Category {
  slug: string;
  name: string;
  productCount?: number;
}

export interface Product {
  id: number;
  sku: string;
  name: string;
  description: string;
  category: Category;
  priceCents: number;
  stock: number;
  inStock: boolean;
  imageUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ProductList {
  data: Product[];
  meta: PageMeta;
}

export interface Totals {
  subtotalCents: number;
  discountCents: number;
  vatCents: number;
  deliveryCents: number;
  totalCents: number;
}

export interface CartItem {
  productId: number;
  sku: string;
  name: string;
  imageUrl: string;
  quantity: number;
  stock: number;
  unitPriceCents: number;
  priceAtAddCents: number;
  priceChanged: boolean;
  lineTotalCents: number;
}

export interface Cart {
  id: string;
  items: CartItem[];
  itemCount: number;
  discount: { code: string; description: string; type: 'percent' | 'fixed'; value: number; amountCents: number } | null;
  totals: Totals;
  currency: 'EUR';
  priceChanged: boolean;
  notices: { code: string; message: string }[];
}

export interface ShippingAddress {
  fullName: string;
  line1: string;
  line2: string;
  city: string;
  county: string;
  postcode: string;
  country: string;
  phone: string;
}

export interface Order {
  id: number;
  number: string;
  userId: number;
  status: string;
  createdAt: string;
  items: { productId: number; name: string; unitPriceCents: number; quantity: number; lineTotalCents: number }[];
  totals: Totals;
  discount: { code: string; amountCents: number } | null;
  currency: 'EUR';
  shipping: ShippingAddress;
  deliveryDate: string | null;
  instructions: string;
  cardLast4: string;
}

export interface AddressSuggestion {
  id: string;
  line1: string;
  city: string;
  county: string;
  postcode: string;
  country: string;
  label: string;
}

export interface Email {
  id: number;
  to: string;
  type: string;
  subject: string;
  body: string;
  link: string | null;
  createdAt: string;
}
