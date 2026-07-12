import * as LabelPrimitive from "@radix-ui/react-slot";
import * as React from "react";

import { cn } from "@/lib/utils";

const Label = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => (
  <label
    ref={ref}
    className={cn(
      "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
      className,
    )}
    {...props}
  />
));
Label.displayName = "Label";

export { Label };
// NOTE: Radix Label を使わない最小実装。必要になれば @radix-ui/react-label 追加。
void LabelPrimitive;
