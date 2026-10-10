export default function MainLoading() {
  return (
    <div className="flex h-[40vh] w-full flex-col items-center justify-center gap-3">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      <span className="text-xs text-muted-foreground animate-pulse tracking-wide font-mono">加载中...</span>
    </div>
  );
}
