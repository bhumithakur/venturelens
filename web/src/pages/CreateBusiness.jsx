import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Building2, CheckCircle2, FileSearch, MapPin, Sparkles, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FormField, Input, Select, Textarea } from "@/components/ui/field";
import { storage, useStorageVersion } from "@/lib/storage";
import { formatDate } from "@/lib/utils";
import { EMPTY_BUSINESS as EMPTY, INDUSTRIES, LIMITS, STAGES, validateBusiness } from "@/lib/business";


export function CreateBusiness() {
  const navigate = useNavigate();
  const [values, setValues] = useState(EMPTY);
  const [touched, setTouched] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const errors = validateBusiness(values);
  const show = (k) => (touched[k] || submitted) && errors[k];
  const set = (k) => (e) => setValues((v) => ({ ...v, [k]: e.target.value }));
  const blur = (k) => () => setTouched((t) => ({ ...t, [k]: true }));
  const a11y = (k) => ({
    id: k,
    name: k,
    value: values[k],
    onChange: set(k),
    onBlur: blur(k),
    invalid: Boolean(show(k)),
    "aria-describedby": show(k) ? `${k}-error` : `${k}-desc`,
  });

  function onSubmit(e) {
    e.preventDefault();
    setSubmitted(true);
    setSaveError(null);
    if (Object.keys(errors).length) {
      document.getElementById(Object.keys(errors)[0])?.focus();
      return;
    }
    try {
      const clean = Object.fromEntries(Object.entries(values).map(([k, val]) => [k, val.trim()]));
      const business = storage.saveBusiness(clean);
      navigate(`/businesses/${business.id}/research`);
    } catch {
      setSaveError("Could not save the business. Your browser storage may be full or disabled.");
    }
  }

  const errorCount = Object.keys(errors).length;

  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <form onSubmit={onSubmit} noValidate className="space-y-6 xl:col-span-2">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-slate-900">Add a business</h2>
          <p className="mt-1 text-sm text-slate-500">
            Tell us about the business or idea. These details shape the market research VentureLens runs for you.
          </p>
        </div>

        <Section icon={Building2} title="Basics" description="Who you are and where you are in your journey.">
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField id="name" label="Business name" required error={show("name")} count={values.name.length} max={LIMITS.name}
              description="Working names are fine; you can change it later." className="sm:col-span-2">
              <Input {...a11y("name")} placeholder="e.g. Ember & Wick Candles" autoComplete="organization" />
            </FormField>
            <FormField id="industry" label="Industry" required error={show("industry")}
              description="Pick a suggestion or type your own niche.">
              <Input {...a11y("industry")} list="industry-options" placeholder="e.g. Retail & e-commerce" />
              <datalist id="industry-options">
                {INDUSTRIES.map((i) => <option key={i} value={i} />)}
              </datalist>
            </FormField>
            <FormField id="stage" label="Business stage" required error={show("stage")}
              description={STAGES.find((s) => s.value === values.stage)?.hint ?? "Helps tailor risks and opportunities."}>
              <Select {...a11y("stage")}>
                <option value="" disabled>Select a stage…</option>
                {STAGES.map((s) => <option key={s.value} value={s.value}>{s.value}</option>)}
              </Select>
            </FormField>
          </div>
        </Section>

        <Section icon={MapPin} title="Market" description="Where you operate and who you serve.">
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField id="location" label="Location" error={show("location")}
              description="City, region or country. Research focuses on this market.">
              <Input {...a11y("location")} placeholder="e.g. Bengaluru, India" autoComplete="address-level2" />
            </FormField>
            <FormField id="targetCustomers" label="Target customers" error={show("targetCustomers")}
              count={values.targetCustomers.length} max={LIMITS.targetCustomers}
              description="Who buys from you? Age, profession, business type…">
              <Input {...a11y("targetCustomers")} placeholder="e.g. Urban professionals aged 25–40 buying gifts" />
            </FormField>
          </div>
        </Section>

        <Section icon={Sparkles} title="Description" description="The single most important input for research quality.">
          <FormField id="description" label="Business description" required error={show("description")}
            count={values.description.trim().length} max={LIMITS.description}
            description="What do you sell, to whom, and how? Be specific about products, channels and pricing.">
            <Textarea {...a11y("description")} rows={5}
              placeholder="e.g. An online store selling hand-poured soy candles in reusable ceramic jars, sold via Instagram and our website, priced ₹600–₹1,500." />
          </FormField>
        </Section>

        {saveError && <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{saveError}</p>}

        <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">
            {submitted && errorCount ? `${errorCount} field${errorCount > 1 ? "s" : ""} need attention.` : "Saved in this browser only."}
          </p>
          <div className="flex gap-2">
            <Link to="/" className={buttonVariants({ variant: "outline" })}>Cancel</Link>
            <Button type="submit">
              <CheckCircle2 /> Create business
            </Button>
          </div>
        </div>
      </form>

      <aside className="space-y-6">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>What happens next</CardTitle>
              <CardDescription>After you create the business</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3 text-sm">
              {[
                [FileSearch, "Open its Market Research workspace"],
                [Users, "Get market size, competitors, segments and risks"],
                [CheckCircle2, "Every finding comes with evidence and source links"],
              ].map(([Icon, text], i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-brand-50 text-brand-600"><Icon className="size-3.5" /></span>
                  <span className="pt-1 text-slate-600">{text}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
        <YourBusinesses />
      </aside>
    </div>
  );
}

function Section({ icon: Icon, title, description, children }) {
  return (
    <Card>
      <CardHeader className="border-b border-slate-100 pb-4">
        <div className="flex gap-3">
          <span className="flex size-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600"><Icon className="size-4" /></span>
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription className="mt-0.5">{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-5">{children}</CardContent>
    </Card>
  );
}

function YourBusinesses() {
  useStorageVersion();
  const list = storage.listBusinesses().slice(0, 5);
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Your businesses</CardTitle>
          <CardDescription>Already in your workspace</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {list.length ? (
          <ul className="divide-y divide-slate-100">
            {list.map((b) => (
              <li key={b.id}>
                <Link to={`/businesses/${b.id}/research`} className="flex items-center justify-between gap-3 py-2.5 hover:text-brand-700">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">{b.name}</p>
                    <p className="text-[11px] text-slate-400">{b.industry} · {formatDate(b.createdAt)}</p>
                  </div>
                  <Badge variant="neutral">{b.stage}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center">
            <Building2 className="mx-auto size-5 text-slate-300" />
            <p className="mt-2 text-sm text-slate-500">No businesses yet. This will be your first.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
