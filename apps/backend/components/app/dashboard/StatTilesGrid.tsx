import type { StatTileData } from "../../../lib/dashboard/types";
import StatTile from "@/components/app/dashboard/StatTile";

type StatTilesGridProps = {
  tiles: StatTileData[];
};

export default function StatTilesGrid({ tiles }: StatTilesGridProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {tiles.map((tile) => (
        <StatTile key={tile.id} tile={tile} />
      ))}
    </div>
  );
}
