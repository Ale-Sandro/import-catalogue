import { EntryInput } from "../../contentstack/types.js";
import { Sku } from "../contentstack.types.js";
import { DatasetSku, DatasetSkuGroup } from "../dataset.types.js";
import { buildBrandTerm } from "../brandTerm.js";
import { buildTags } from "./buildTags.js";

export function buildEntry(
  sku: DatasetSku,
  skuGroup: DatasetSkuGroup,
): EntryInput<Sku> {
  const images = sku.productImages
    ? sku.productImages.map((image) => ({
        pixl_url: image.pixlUrl,
        alt: image.alt,
        focal_point: "center" as const,
      }))
    : [];

  return {
    title: sku.title,
    sku_id: sku.skuId,
    sku_code: sku.skuCode,
    images,
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
    taxonomies: [buildBrandTerm(skuGroup.brand)],
  };
}
