import * as turf from "@turf/turf";

/**
 * 将相邻行政区合并为连通面的外轮廓。
 * 用于内阴影和流光，避免把内部省界也当成外边缘。
 */
export function buildMergedBoundary(
  projected: GeoJSON.FeatureCollection,
  groupName = "merged",
): GeoJSON.FeatureCollection {
  const flattened = turf.flatten(projected);
  const withGroup = {
    ...flattened,
    features: flattened.features.map((f) => ({
      ...f,
      properties: { ...f.properties, _group: groupName },
    })),
  } as GeoJSON.FeatureCollection<GeoJSON.Polygon>;

  return turf.dissolve(withGroup, { propertyName: "_group" });
}
