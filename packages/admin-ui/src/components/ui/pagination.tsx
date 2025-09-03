import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import styles from "./pagination.module.css";

const Pagination = ({ className, ...props }: React.ComponentProps<"nav">) => (
  <nav aria-label="pagination" className={cn(styles.nav, className)} {...props} />
);
Pagination.displayName = "Pagination";

const PaginationContent = React.forwardRef<HTMLUListElement, React.ComponentProps<"ul">>(
  ({ className, ...props }, ref) => (
    <ul ref={ref} className={cn(styles.list, className)} {...props} />
  )
);
PaginationContent.displayName = "PaginationContent";

const PaginationItem = React.forwardRef<HTMLLIElement, React.ComponentProps<"li">>(
  ({ className, ...props }, ref) => <li ref={ref} className={cn("", className)} {...props} />
);
PaginationItem.displayName = "PaginationItem";

type PaginationLinkProps = {
  isActive?: boolean;
} & React.ComponentProps<"button">;

const PaginationLink = ({ className, isActive, children, ...props }: PaginationLinkProps) => (
  <Button variant={isActive ? "outline" : "ghost"} size="icon" className={className} {...props}>
    {children}
  </Button>
);
PaginationLink.displayName = "PaginationLink";

const PaginationPrevious = ({
  className,
  ...props
}: React.ComponentProps<typeof PaginationLink>) => (
  <Button
    variant="ghost"
    aria-label="Go to previous page"
    className={cn(styles.prev, className)}
    {...props}
  >
    <ChevronLeft size={16} />
    <span>Previous</span>
  </Button>
);
PaginationPrevious.displayName = "PaginationPrevious";

const PaginationNext = ({ className, ...props }: React.ComponentProps<typeof PaginationLink>) => (
  <Button
    variant="ghost"
    aria-label="Go to next page"
    className={cn(styles.next, className)}
    {...props}
  >
    <span>Next</span>
    <ChevronRight size={16} />
  </Button>
);
PaginationNext.displayName = "PaginationNext";

const PaginationEllipsis = ({ className, ...props }: React.ComponentProps<"span">) => (
  <span aria-hidden="true" className={cn(styles.ellipsis, className)} {...props}>
    <MoreHorizontal size={16} />
  </span>
);
PaginationEllipsis.displayName = "PaginationEllipsis";

export {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
};
