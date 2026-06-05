export interface PublishDetails {
  environment: string;
  locale: string;
  time: string;
  user: string;
}

export interface Image {
  pixl_url: string;
  alt: string;
  focal_point:
    | "center"
    | "top"
    | "bottom"
    | "left"
    | "right"
    | "left-bottom"
    | "left-top"
    | "right-bottom"
    | "right-top";
}

export interface Sku {
  title: string;
  locale_availability?: string[];
  sku_id?: string;
  sku_code?: string;
  tags?: string[];
  description?: string;
  designed_for?: string;
  catchline?: string;
  colors?: {
    color_id: string;
    label: string;
    hexa: string;
  }[];
  size_label?: string;
  images?: Image[];
  price?: number | null;
  taxonomies?: { taxonomy_uid: string; term_uid: string }[];
}

export interface SkuGroup {
  locale_availability: string[];
  title: string;
  skus: Sku[];
  variance_code: string;
  item_group_id?: string;
  model_id?: string;
  taxonomies?: { taxonomy_uid: string; term_uid: string }[];
  url?: string;
  slug?: string;
  weight?: string;
  garantee?: string;
  functionalities?: {
    label: string;
    value: string;
  }[];
  materials_and_care?: {
    label: string;
    value: string;
  }[];
  benefits?: {
    benefit_id: string;
    label: string;
    value: string;
    picto: string;
  }[];
  alternative_title?: string;
  images?: Image[];
  price?: number | null;
}
