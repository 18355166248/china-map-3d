declare module "earcut" {
  function earcut(
    data: number[],
    holeIndices?: number[] | null,
    dimensions?: number,
  ): number[];

  export function flatten(data: number[][][]): {
    vertices: number[];
    holes: number[];
    dimensions: number;
  };

  export default earcut;
}

