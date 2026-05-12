import { DatasetSkuGroup } from "../../dataset.types.js";
import { BrandsLocale } from "../../types.js";
import { applyLocaleOverrides } from "./applyLocaleOverrides.js";

export type SkuGroupTask = {
  label: string;
  data: DatasetSkuGroup;
  localeOverride: BrandsLocale;
};

export function buildTasks(params: {
  groups: DatasetSkuGroup[];
  localeToken: string;
  localeOverride: BrandsLocale;
  localeAvailability: BrandsLocale[];
}): SkuGroupTask[] {
  return params.groups.map((group, index) => {
    const labelId = group.id ?? group.itemGroupId ?? String(index);
    return {
      label: `${params.localeToken}_${labelId}.ndjson`,
      data: applyLocaleOverrides(
        group,
        params.localeAvailability,
        params.localeOverride,
      ),
      localeOverride: params.localeOverride,
    };
  });
}
