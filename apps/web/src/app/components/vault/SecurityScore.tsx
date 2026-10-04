type SecurityScoreProps = {
  score: number;
  totalCredentials: number;
};

export default function SecurityScore({
  score,
  totalCredentials,
}: SecurityScoreProps) {
  const status =
    score >= 80
      ? "Good"
      : score >= 50
        ? "Needs attention"
        : "Weak";

  return (
    <section className="grid gap-5 lg:grid-cols-[1.15fr_1fr]">
      <div className="relative overflow-hidden rounded-[24px] bg-[#20285e] p-6 text-white shadow-sm sm:p-8">
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full border-[22px] border-[#c45b48]/20" />

        <div className="relative">
          <p className="text-sm font-medium text-white/60">
            Security Score
          </p>

          <div className="mt-5 flex items-end gap-3">
            <span className="text-6xl font-bold tracking-tight">
              {score}%
            </span>

            <span className="mb-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/70">
              {status}
            </span>
          </div>

          <div className="mt-6 h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-[#e06b50] transition-all"
              style={{ width: `${score}%` }}
            />
          </div>

          <p className="mt-4 text-xs leading-5 text-white/50">
            Based on the strength of your stored passwords.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-[24px] bg-white p-6 shadow-sm ring-1 ring-slate-100">
          <p className="text-sm text-slate-400">
            Total credentials
          </p>

          <p className="mt-3 text-3xl font-bold">
            {totalCredentials}
          </p>

          <p className="mt-1 text-xs text-slate-400">
            Stored securely
          </p>
        </div>

        <div className="rounded-[24px] bg-white p-6 shadow-sm ring-1 ring-slate-100">
          <p className="text-sm text-slate-400">
            Vault status
          </p>

          <p className="mt-3 text-xl font-bold text-emerald-600">
            Unlocked
          </p>

          <p className="mt-1 text-xs text-slate-400">
            Encryption active
          </p>
        </div>
      </div>
    </section>
  );
}