/**
 * Lifecycle log for a Safe transaction: when it was proposed, each signature,
 * whether/when the nonce was consumed by a rejection or a competing tx, and
 * when it executed. All timestamps come straight from the Safe Transaction
 * Service (submissionDate, confirmations[].submissionDate, executionDate).
 *
 * Actors (proposer, signer, executor) render through <Address> so they pick up
 * address-book / Safe treatment and are never abbreviated.
 */

import type { SafeApiMultisigTransaction } from '@shield3/sky-safe-core';
import { Address } from './Address';

interface TransactionLogProps {
  transaction: SafeApiMultisigTransaction;
  /** All transactions sharing this nonce — used to detect rejection/supersede. */
  allTransactions: SafeApiMultisigTransaction[];
  safeAddress: string;
}

type Tone = 'proposed' | 'signed' | 'executed' | 'failed' | 'rejected';

interface LogEvent {
  date: string | null;
  title: string;
  tone: Tone;
  actor?: string;
  detail?: string;
}

const DOT: Record<Tone, string> = {
  proposed: 'bg-blue-500',
  signed: 'bg-indigo-500',
  executed: 'bg-green-600',
  failed: 'bg-red-600',
  rejected: 'bg-gray-500',
};

/**
 * Absolute time plus a coarse relative suffix. Rendered in the viewer's local
 * time zone (via toLocaleString) with the zone name shown — `timeZoneName:
 * 'short'` appends the local zone (e.g. "PST", "GMT+1"), so the time is never
 * ambiguous about whether it is UTC or local.
 */
function formatTime(iso: string | null): string {
  if (!iso) return 'pending';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const abs = d.toLocaleString(undefined, { timeZoneName: 'short' });
  const diffMs = Date.now() - d.getTime();
  const rel = relative(diffMs);
  return rel ? `${abs} (${rel})` : abs;
}

function relative(diffMs: number): string {
  const past = diffMs >= 0;
  const s = Math.abs(diffMs) / 1000;
  const units: Array<[number, string]> = [
    [86400, 'day'],
    [3600, 'hour'],
    [60, 'minute'],
    [1, 'second'],
  ];
  for (const [secs, name] of units) {
    if (s >= secs) {
      const n = Math.floor(s / secs);
      return past ? `${n} ${name}${n === 1 ? '' : 's'} ago` : `in ${n} ${name}${n === 1 ? '' : 's'}`;
    }
  }
  return 'just now';
}

/**
 * Compact lifecycle log for a transaction-list row: proposed, each signer, and
 * the terminal event (executed / reverted). Actors are returned as raw
 * addresses so the list can render them through <Address> (never abbreviated).
 */
export function conciseTimeline(
  tx: SafeApiMultisigTransaction
): Array<{ label: string; time: string; actor?: string }> {
  const rows: Array<{ label: string; time: string; actor?: string }> = [
    { label: 'Proposed', time: formatTime(tx.submissionDate), actor: tx.proposer || undefined },
  ];

  for (const c of [...(tx.confirmations || [])].sort(
    (a, b) => new Date(a.submissionDate).getTime() - new Date(b.submissionDate).getTime()
  )) {
    rows.push({ label: 'Signed', time: formatTime(c.submissionDate), actor: c.owner });
  }

  if (tx.isExecuted) {
    rows.push({
      label: tx.isSuccessful === false ? 'Reverted' : 'Executed',
      time: formatTime(tx.executionDate),
      actor: tx.executor || undefined,
    });
  }
  return rows;
}

/** An on-chain rejection is a 0-value, no-data call from the Safe to itself. */
function isRejectionTx(tx: SafeApiMultisigTransaction, safeAddress: string): boolean {
  return tx.to.toLowerCase() === safeAddress.toLowerCase() && tx.value === '0' && (!tx.data || tx.data === '0x');
}

export function TransactionLog({ transaction, allTransactions, safeAddress }: TransactionLogProps) {
  const events: LogEvent[] = [];
  const thisIsRejection = isRejectionTx(transaction, safeAddress);

  // Proposed
  events.push({
    date: transaction.submissionDate,
    title: thisIsRejection ? 'Rejection proposed' : 'Proposed',
    tone: 'proposed',
    actor: transaction.proposer || undefined,
    detail: transaction.proposedByDelegate ? `via delegate ${transaction.proposedByDelegate}` : undefined,
  });

  // Signatures — sorted oldest first
  const confirmations = [...(transaction.confirmations || [])].sort(
    (a, b) => new Date(a.submissionDate).getTime() - new Date(b.submissionDate).getTime()
  );
  for (const c of confirmations) {
    events.push({
      date: c.submissionDate,
      title: 'Signed',
      tone: 'signed',
      actor: c.owner,
      detail: c.signatureType ? c.signatureType : undefined,
    });
  }

  // Terminal state
  if (transaction.isExecuted) {
    events.push({
      date: transaction.executionDate,
      title:
        transaction.isSuccessful === false
          ? 'Executed — reverted'
          : thisIsRejection
            ? 'Rejection executed'
            : 'Executed',
      tone: transaction.isSuccessful === false ? 'failed' : thisIsRejection ? 'rejected' : 'executed',
      actor: transaction.executor || undefined,
    });
  } else {
    // Not executed: did a sibling at this nonce consume it?
    const executedSibling = allTransactions.find((t) => t.safeTxHash !== transaction.safeTxHash && t.isExecuted);
    if (executedSibling) {
      const rej = isRejectionTx(executedSibling, safeAddress);
      events.push({
        date: executedSibling.executionDate,
        title: rej ? 'Rejected on-chain' : 'Superseded at this nonce',
        tone: 'rejected',
        actor: executedSibling.executor || undefined,
        detail: rej
          ? 'the nonce was consumed by an on-chain rejection'
          : 'a different transaction at this nonce was executed',
      });
    } else {
      events.push({
        date: null,
        title: `Awaiting execution (${transaction.confirmations?.length || 0}/${transaction.confirmationsRequired} signatures)`,
        tone: 'proposed',
      });
    }
  }

  return (
    <div className="space-y-1">
      <ol className="relative border-l-2 border-gray-200 ml-2">
        {events.map((e, i) => (
          <li key={i} className="ml-4 py-2">
            <span
              className={`absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full ring-2 ring-white ${DOT[e.tone]}`}
              aria-hidden
            />
            <div className="flex flex-col gap-0.5">
              <span className="font-semibold text-sm text-gray-900">{e.title}</span>
              <span className="text-xs text-gray-500">{formatTime(e.date)}</span>
              {e.actor && (
                <span className="text-xs mt-0.5">
                  <span className="text-gray-500">by </span>
                  <Address address={e.actor} />
                </span>
              )}
              {e.detail && <span className="text-xs text-gray-500">{e.detail}</span>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
