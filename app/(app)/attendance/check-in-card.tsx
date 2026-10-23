"use client";

// Check in with where you're working; check out when you leave. One tap each (plan/4-hr-module.md, attendance).
// Rough location is optional and asked for only when ticked: it's recorded, never enforced (D76).
import { Checkbox } from "@/components/ui/choice";
import { useState, useTransition } from "react";
import { Building2, Home, Loader2, LogIn, LogOut, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMinutes, formatTime, formatWeekdayDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ATTENDANCE_LOCATION_LABELS, type AttendanceLocation } from "@/lib/types";
import type { MyAttendance } from "@/services/attendance";
import { checkInAction, checkOutAction } from "./actions";

const ICONS: Record<AttendanceLocation, typeof Building2> = { office: Building2, home: Home, client_site: MapPin };

/**
 * The browser's position, if the person allows it within a few seconds. The browser's own timeout doesn't count the
 * time the permission prompt is open, so our own timer makes sure check-in never waits on an unanswered prompt.
 */
function position(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve(null);
    const timer = setTimeout(() => resolve(null), 8000);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        clearTimeout(timer);
        resolve({ lat: p.coords.latitude, lng: p.coords.longitude });
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
      { timeout: 6000, maximumAge: 300_000 },
    );
  });
}

export function CheckInCard({ me, compact = false }: { me: MyAttendance; compact?: boolean }) {
  const [note, setNote] = useState("");
  const [share, setShare] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [pending, start] = useTransition();
  const r = me.record;

  const checkIn = (location: AttendanceLocation) =>
    start(async () => {
      const where = share ? await position() : null;
      const res = await checkInAction({ location, note, lat: where?.lat ?? null, lng: where?.lng ?? null });
      setMessage({ text: share && !where && res.ok ? `${res.message} (Location wasn't available.)` : res.message, error: !res.ok });
    });
  const checkOut = () => {
    // A stray tap would end the day (you can check in again, but the gap counts as time away).
    if (!window.confirm(`Check out now, at ${formatTime(new Date())}?`)) return;
    start(async () => {
      const res = await checkOutAction({});
      setMessage({ text: res.message, error: !res.ok });
    });
  };

  return (
    <section className={cn("space-y-3 rounded-lg border bg-card shadow-card", compact ? "p-3" : "p-4")} aria-label="Attendance">
      {!r ? (
        <>
          <p className="text-sm font-medium">Where are you working today?</p>
          {/* Note and location first: the buttons below check you in at once. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Note (optional), e.g. shoot at Zenith campus" aria-label="Note" className="h-8 min-w-0 flex-1 basis-56" />
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox checked={share} onChange={(e) => setShare(e.target.checked)} className="size-4 accent-primary" />
              Add rough location
            </label>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(ATTENDANCE_LOCATION_LABELS) as AttendanceLocation[]).map((loc) => {
              const Icon = ICONS[loc];
              return (
                <Button key={loc} variant="outline" className="h-auto flex-col gap-1 py-2.5" disabled={pending} onClick={() => checkIn(loc)}>
                  <Icon className="size-5" />
                  <span className="text-xs">{ATTENDANCE_LOCATION_LABELS[loc]}</span>
                </Button>
              );
            })}
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
            {(() => {
              const Icon = ICONS[r.location];
              return <Icon className="size-4" />;
            })()}
          </span>
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-medium">
              {ATTENDANCE_LOCATION_LABELS[r.location]} · in at {formatTime(new Date(r.checkInAt))}
              {r.checkOutAt ? ` · out at ${formatTime(new Date(r.checkOutAt))}` : ""}
            </p>
            <p className="text-xs text-muted-foreground">
              {r.checkOutAt ? `${formatMinutes(Math.max(0, Math.round((new Date(r.checkOutAt).getTime() - new Date(r.checkInAt).getTime()) / 60_000) - r.awayMinutes))} today` : "Checked in"}
              {r.awayMinutes ? ` · ${formatMinutes(r.awayMinutes)} away` : ""}
              {r.late ? " · after 9:45" : ""}
              {r.note ? ` · ${r.note}` : ""}
            </p>
          </div>
          {!r.checkOutAt ? (
            <Button variant="outline" size="sm" disabled={pending} onClick={checkOut}>
              {pending ? <Loader2 className="animate-spin" /> : <LogOut />} Check out
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled={pending} onClick={() => checkIn(r.location)}>
              {pending ? <Loader2 className="animate-spin" /> : <LogIn />} Check in again
            </Button>
          )}
        </div>
      )}
      {me.openDays.map((d) => (
        <CloseDay key={d.id} workDate={d.workDate} checkedIn={new Date(d.checkInAt)} />
      ))}
      {message ? (
        <p role={message.error ? "alert" : "status"} className={cn("text-xs", message.error ? "text-danger" : "text-success")}>
          {message.text}
        </p>
      ) : null}
    </section>
  );
}

/** A day someone forgot to check out of: they enter when they left (within a week; after that, HR fixes it). */
function CloseDay({ workDate, checkedIn }: { workDate: string; checkedIn: Date }) {
  const [time, setTime] = useState("");
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-wrap items-center gap-2 rounded-md bg-warning-soft px-3 py-2 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await checkOutAction({ workDate, time });
          setMessage({ text: res.message, error: !res.ok });
        });
      }}
    >
      <span className="min-w-0 flex-1 text-warning">
        No check-out on {formatWeekdayDate(workDate)} (in at {formatTime(checkedIn)}). When did you leave?
      </span>
      <Input type="time" required value={time} onChange={(e) => setTime(e.target.value)} aria-label={`Time you left on ${formatWeekdayDate(workDate)}`} className="h-8 w-28" />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        Save
      </Button>
      {message?.error ? (
        <span role="alert" className="w-full text-xs text-danger">
          {message.text}
        </span>
      ) : null}
    </form>
  );
}
