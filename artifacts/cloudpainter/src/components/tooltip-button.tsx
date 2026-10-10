import * as React from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

type ActionTooltipProps = {
  description: string;
  children: React.ReactElement;
};

/** Uses the shared portal so descriptions stay outside clipped workspace panels. */
export function ActionTooltip({ description, children }: ActionTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent className="action-tooltip" sideOffset={8} collisionPadding={12}>
        {description}
      </TooltipContent>
    </Tooltip>
  );
}

type TooltipButtonProps = Omit<React.ComponentPropsWithoutRef<'button'>, 'title'> & {
  description: string;
};

/** Disabled buttons stay native-disabled; only their explanation wrapper can focus. */
export const TooltipButton = React.forwardRef<HTMLButtonElement, TooltipButtonProps>(
  ({ description, disabled, children, type = 'button', ...props }, ref) => {
    const button = (
      <button {...props} ref={ref} type={type} disabled={disabled}>
        {children}
      </button>
    );

    return (
      <ActionTooltip description={description}>
        {disabled ? (
          <span
            className="tooltip-disabled-trigger"
            tabIndex={0}
            role="group"
            aria-disabled="true"
            aria-label={props['aria-label']}
          >
            {button}
          </span>
        ) : button}
      </ActionTooltip>
    );
  },
);
TooltipButton.displayName = 'TooltipButton';
