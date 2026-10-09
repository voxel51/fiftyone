import { IconBase, type IconProps } from "@voxel51/voodo";
import type { FC, SVGProps } from "react";

// design-system #147 adds these as IconName.ChevronDouble{Left,Right}
const CHEVRON_LEFT =
  "M7.76336 9L13.1221 4.10314C13.374 3.87294 13.5 3.57997 13.5 3.22422C13.5 2.86846 13.374 2.57549 13.1221 2.34529C12.8702 2.1151 12.5496 2 12.1603 2C11.771 2 11.4504 2.1151 11.1985 2.34529L4.87786 8.12108C4.74046 8.24664 4.64313 8.38266 4.58588 8.52915C4.52863 8.67564 4.5 8.83259 4.5 9C4.5 9.16741 4.52863 9.32436 4.58588 9.47085C4.64313 9.61734 4.74046 9.75336 4.87786 9.87892L11.1985 15.6547C11.4504 15.8849 11.771 16 12.1603 16C12.5496 16 12.8702 15.8849 13.1221 15.6547C13.374 15.4245 13.5 15.1315 13.5 14.7758C13.5 14.42 13.374 14.1271 13.1221 13.8969L7.76336 9Z";
const CHEVRON_RIGHT =
  "M10.0992 9L5.33588 4.10314C5.11196 3.87294 5 3.57997 5 3.22422C5 2.86846 5.11196 2.57549 5.33588 2.34529C5.5598 2.1151 5.84478 2 6.19084 2C6.5369 2 6.82188 2.1151 7.0458 2.34529L12.6641 8.12108C12.7863 8.24664 12.8728 8.38266 12.9237 8.52915C12.9746 8.67564 13 8.83259 13 9C13 9.16741 12.9746 9.32436 12.9237 9.47085C12.8728 9.61734 12.7863 9.75336 12.6641 9.87892L7.0458 15.6547C6.82188 15.8849 6.5369 16 6.19084 16C5.84478 16 5.5598 15.8849 5.33588 15.6547C5.11196 15.4245 5 15.1315 5 14.7758C5 14.42 5.11196 14.1271 5.33588 13.8969L10.0992 9Z";

const doubled =
  (path: string, offsets: [number, number]): FC<SVGProps<SVGSVGElement>> =>
  (props) => (
    <svg viewBox="0 0 18 18" fill="none" {...props}>
      {offsets.map((x) => (
        <path
          key={x}
          transform={`matrix(0.75 0 0 0.75 ${x} 2.25)`}
          d={path}
          fill="currentColor"
        />
      ))}
    </svg>
  );

const LeftSvg = doubled(CHEVRON_LEFT, [-1.375, 5.875]);
const RightSvg = doubled(CHEVRON_RIGHT, [-1.25, 5.75]);

export const ChevronDoubleLeftIcon: FC<IconProps> = (props) => (
  <IconBase svg={LeftSvg} {...props} />
);

export const ChevronDoubleRightIcon: FC<IconProps> = (props) => (
  <IconBase svg={RightSvg} {...props} />
);
