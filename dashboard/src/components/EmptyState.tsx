type EmptyStateProps = {
  title: string;
  description?: string;
};

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="empty">
      <p>{title}</p>
      {description ? <p>{description}</p> : null}
    </div>
  );
}
