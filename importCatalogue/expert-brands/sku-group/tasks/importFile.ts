import { DatasetSkuGroup } from "../../dataset.types.js";
import { BrandsLocale } from "../../types.js";
import { isExcludedSupermodel } from "../exclusions.js";
import { filterSkusWithImages } from "./filterSkusWithImages.js";
import { importSkuGroup } from "../import.js";
import { ImportSkuGroupOptions } from "../options.js";

export async function importFile(params: {
  index: number;
  total: number;
  label: string;
  skuGroup: DatasetSkuGroup;
  locale: BrandsLocale;
  importOptions: ImportSkuGroupOptions;
}) {
  const startTime = Date.now();

  console.info(
    `${params.index + 1}/${params.total} Importing sku group from file: ${params.label}`,
  );

  const { filtered: skuGroupWithImages, skipped } =
    filterSkusWithImages(params.skuGroup);

  if (isExcludedSupermodel(String(params.skuGroup.itemGroupId))) {
    console.info(
      `Skipping excluded SKU Group itemGroupId=${params.skuGroup.itemGroupId} from file: ${params.label}`,
    );
    return {
      imported: false,
      durationMs: Date.now() - startTime,
    };
  }

  if (skipped > 0) {
    console.info(`Skipping ${skipped} SKU(s) without images for file: ${params.label}`);
  }

  if (!skuGroupWithImages.skus.length) {
    console.info(
      `Skipping sku group from file: ${params.label} because no SKUs with images.`,
    );
    return {
      imported: false,
      durationMs: Date.now() - startTime,
    };
  }

  await importSkuGroup(skuGroupWithImages, params.locale, params.importOptions);
  return {
    imported: true,
    durationMs: Date.now() - startTime,
  };
}
