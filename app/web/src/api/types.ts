export type Role = 'customer' | 'admin' | 'support';

export interface User {
  id: number;
  email: string;
  name: string;
  role: Role;
  emailVerified: boolean;
  avatarUrl: string | null;
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
  images: string[];
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
  discounts: { code: string; description: string; type: 'percent' | 'fixed'; value: number; amountCents: number }[];
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

export const ORDER_STATUSES = ['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export interface Order {
  id: number;
  number: string;
  userId: number;
  customer: { id: number; email: string; name: string };
  status: OrderStatus;
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

export interface Tracking {
  orderId: number;
  number: string;
  status: OrderStatus;
  carrier: string;
  trackingNumber: string;
  estimatedDelivery: string | null;
  events: { status: string; label: string; at: string }[];
}

export interface WishlistItem {
  position: number;
  addedAt: string;
  product: Product;
}

export interface PaymentIntent {
  id: string;
  amountCents: number;
  status: string;
  clientSecret: string;
  frameUrl: string;
}

export type Currency = 'EUR' | 'GBP';

export interface AppConfig {
  paymentFrameUrl: string;
  testHooks: boolean;
  currencies: Record<Currency, number>;
  /** Bug-mode defects currently on (empty unless the API runs with TEST_HOOKS=true). */
  bugs: string[];
}

export interface Review {
  id: number;
  productId: number;
  rating: number;
  title: string;
  body: string;
  author: { id: number; name: string };
  createdAt: string;
}

export interface ReviewList {
  data: Review[];
  meta: { count: number; average: number | null };
}

export interface Store {
  id: string;
  name: string;
  address: string;
  city: string;
  lat: number;
  lng: number;
  hours: string;
  distanceKm?: number;
}

export interface Offer {
  code: string;
  description: string;
  type: 'percent' | 'fixed';
  value: number;
  minSpendCents: number;
}
