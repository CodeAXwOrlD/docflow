import dynamic from "next/dynamic";
import SpatialFallback from "./SpatialFallback";

const SpatialSceneDynamic = dynamic(
  () => import("./SpatialScene"),
  {
    ssr: false,
    loading: () => <SpatialFallback progress={0.3} />,
  }
);

export default SpatialSceneDynamic;
