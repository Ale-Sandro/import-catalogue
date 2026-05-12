import { EntryInput } from "../../contentstack/types.js";
import { Sku } from "../contentstack.types.js";
import { DatasetSku, DatasetSkuGroup } from "../dataset.types.js";
import { BRAND_TERM } from "../config.js";
import { buildTags } from "./buildTags.js";

export function buildEntry(
  sku: DatasetSku,
  skuGroup: DatasetSkuGroup,
): EntryInput<Sku> {
  return {
    title: sku.title,
    sku_id: sku.skuId,
    sku_code: sku.skuCode,
    images: sku.productImages?.map((image) => ({
      pixl_url: image.pixlUrl,
      alt: image.alt,
      focal_point: "center",
    })),
    size_label: sku.sizeLabel || "",
    colors: sku.colors?.map((color) => ({
      color_id: String(color.id),
      label: color.label,
      hexa: color.hexa,
    })),
    designed_for: sku.designedFor || undefined,
    catchline: skuGroup.catchline || undefined,
    description: sku.description || undefined,
    price: sku.price || undefined,
    tags: buildTags(sku),
    taxonomies: [BRAND_TERM],
  };
}
