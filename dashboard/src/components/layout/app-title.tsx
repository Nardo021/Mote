import { MoteMark } from "../Icons.js";

export function AppTitle() {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5">
      <MoteMark />
      <span className="text-sm font-semibold">Mote</span>
    </div>
  );
}
