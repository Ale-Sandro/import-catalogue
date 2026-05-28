import { BrandsLocaleInput } from "./types.js";

export type DatasetImage = {
  type: string;
  pixlUrl: string;
  alt: string;
};

type DatasetFunctionalities = {
  title: string;
  value: string;
};

type DatasetBenefit = {
  id: string;
  label: string;
  value: string;
  picto: string;
  image?: string;
};

type DatasetColor = {
  id: string;
  label: string;
  hexa: string;
};

export type DatasetSku = {
  skuId: string;
  skuCode: string;
  locale: BrandsLocaleInput;
  productImages: DatasetImage[] | null;
  contextImages: DatasetImage[] | null;
  sizeLabel: string;
  colors: DatasetColor[] | null;
  designedFor: string | null;
  description: string | null;
  title: string;
  price: number | null;
  isOutOfStock?: boolean | null;
  tags?: string[] | null;
  tag?: string | null;
};

export type DatasetSkuGroup = {
  id: string;
  title: string;
  skus: DatasetSku[];
  varianceCode: string;
  brand: string;
  localeAvailability: BrandsLocaleInput[];
  itemGroupId: string;
  catchline: string | null;
  variantType: string;
  ranking: number;
  notice: string | null;
  categories: string[] | null;
  url: string | null;
  slug: string | null;
  weight: string | null;
  garantee: string | null;
  functionalities: DatasetFunctionalities[] | null;
  materialAndCare?: DatasetFunctionalities[] | null;
  benefits: DatasetBenefit[] | null;
  tags?: string[] | null;
  tag?: string | null;
};
