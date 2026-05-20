import { Skeleton } from '../ui/Skeleton'

export function SecurityLoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="glass p-4 rounded-lg">
            <div className="flex items-center gap-3">
              <Skeleton variant="circular" width={40} height={40} />
              <div>
                <Skeleton variant="text" width={60} height={28} className="mb-1" />
                <Skeleton variant="text" width={80} height={12} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="glass p-4 rounded-lg">
            <Skeleton variant="text" width={100} height={16} className="mb-4" />
            <div className="flex justify-center">
              <Skeleton variant="circular" width={150} height={150} />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {[1, 2].map(i => (
          <div key={i} className="glass p-4 rounded-lg">
            <Skeleton variant="text" width={120} height={16} className="mb-4" />
            <div className="space-y-2">
              {[1, 2, 3].map(j => (
                <div key={j} className="flex items-center gap-3 p-2 rounded bg-secondary/20">
                  <Skeleton variant="circular" width={16} height={16} />
                  <div className="flex-1">
                    <Skeleton variant="text" width={150} height={14} className="mb-1" />
                    <Skeleton variant="text" width={80} height={12} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
