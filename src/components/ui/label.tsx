import * as React from 'react';
import { cn } from '@/lib/utils';

const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(({ className, ...props }, ref) => (
  <label ref={ref} className={cn('block text-[12.5px] font-medium text-muted-foreground mb-1.5 mt-3 first:mt-0', className)} {...props} />
));
Label.displayName = 'Label';

export { Label };
