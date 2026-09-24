'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import { SunShadeEmblem } from '@/components/SunShadeLogo';
import { OnboardingStep1 } from '@/components/onboarding/OnboardingStep1';
import { OnboardingStep2 } from '@/components/onboarding/OnboardingStep2';
import { OnboardingStep3 } from '@/components/onboarding/OnboardingStep3';

type Step = 1 | 2 | 3;

function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 40);
}

const STEPS = [
  { num: 1, label: 'Workspace' },
  { num: 2, label: 'First Project' },
  { num: 3, label: 'API Key' },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [checkingExisting, setCheckingExisting] = useState(true);
  const [error, setError] = useState('');

  // Step 1 state
  const [orgName, setOrgName] = useState('');
  const [workspaceSlug, setWorkspaceSlug] = useState('');
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);

  // Step 2 state
  const [projectName, setProjectName] = useState('');
  const [projectSlug, setProjectSlug] = useState('');
  const [projectSlugManual, setProjectSlugManual] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('software');

  // Step 3 state
  const [result, setResult] = useState<{
    tenant: any; project: any; api_key: string; workspace_url: string;
  } | null>(null);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const isExplicitNew = searchParams.get('new') === 'true' || searchParams.get('create') === 'true';
    if (isExplicitNew) {
      setCheckingExisting(false);
      return;
    }

    fetch('/api/v1/tenants/me', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.workspaces && data.workspaces.length > 0) {
          const primary = data.primary_workspace || data.workspaces[0];
          const firstProj = primary.projects?.[0]?.slug;
          const target = firstProj ? `/${primary.slug}/${firstProj}` : `/${primary.slug}`;
          router.replace(target);
        } else {
          setCheckingExisting(false);
        }
      })
      .catch(() => {
        setCheckingExisting(false);
      });
  }, [router]);

  const handleOrgNameChange = (v: string) => {
    setOrgName(v);
    if (!slugManuallyEdited) setWorkspaceSlug(slugify(v));
  };

  const handleProjectNameChange = (v: string) => {
    setProjectName(v);
    if (!projectSlugManual) setProjectSlug(slugify(v));
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/v1/tenants/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_name: orgName,
          slug: workspaceSlug,
          project_name: projectName,
          project_slug: projectSlug,
          template_id: selectedTemplate,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to create workspace. Please try again.');
        setLoading(false);
        return;
      }

      setResult(data);
      setStep(3);
    } catch (err: any) {
      setError(err.message || 'Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (checkingExisting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#090d16]">
        <div className="flex flex-col items-center gap-3">
          <SunShadeEmblem size={44} className="animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#090d16]">
      <div className="w-full max-w-xl space-y-8">
        <div className="text-center space-y-3">
          <SunShadeEmblem size={48} className="mx-auto" />
          <h1 className="text-2xl font-extrabold text-white tracking-tight">
            Set up your workspace
          </h1>
          <p className="text-sm text-slate-400">
            Takes 60 seconds. You can customize everything later.
          </p>
        </div>

        <div className="flex items-center justify-center space-x-2">
          {STEPS.map((s, i) => (
            <div key={s.num} className="flex items-center">
              <div
                className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold border transition-all ${
                  step > s.num
                    ? 'bg-emerald-500 border-emerald-500 text-slate-950'
                    : step === s.num
                    ? 'border-emerald-500 text-emerald-400 bg-emerald-500/10'
                    : 'border-slate-700 text-slate-600'
                }`}
              >
                {step > s.num ? <Check className="w-3.5 h-3.5" /> : s.num}
              </div>
              <span
                className={`ml-1.5 text-xs font-medium ${
                  step === s.num ? 'text-white' : 'text-slate-500'
                }`}
              >
                {s.label}
              </span>
              {i < STEPS.length - 1 && (
                <div className={`mx-3 h-px w-8 ${step > s.num ? 'bg-emerald-500' : 'bg-slate-700'}`} />
              )}
            </div>
          ))}
        </div>

        {step === 1 && (
          <OnboardingStep1
            orgName={orgName}
            workspaceSlug={workspaceSlug}
            onOrgNameChange={handleOrgNameChange}
            onWorkspaceSlugChange={(val) => {
              setSlugManuallyEdited(true);
              setWorkspaceSlug(val);
            }}
            error={error}
            onNext={() => {
              if (!orgName.trim() || !workspaceSlug.trim()) {
                setError('Both fields are required');
                return;
              }
              setError('');
              setStep(2);
            }}
          />
        )}

        {step === 2 && (
          <OnboardingStep2
            workspaceSlug={workspaceSlug}
            projectName={projectName}
            projectSlug={projectSlug}
            selectedTemplate={selectedTemplate}
            onProjectNameChange={handleProjectNameChange}
            onProjectSlugChange={(val) => {
              setProjectSlugManual(true);
              setProjectSlug(val);
            }}
            onTemplateChange={setSelectedTemplate}
            onBack={() => { setError(''); setStep(1); }}
            onSubmit={() => {
              if (!projectName.trim() || !projectSlug.trim()) {
                setError('Project name and slug are required');
                return;
              }
              setError('');
              handleSubmit();
            }}
            loading={loading}
            error={error}
          />
        )}

        {step === 3 && result && (
          <OnboardingStep3
            result={result}
            onEnterWorkspace={() => {
              if (result?.workspace_url) {
                router.push(result.workspace_url);
              }
            }}
          />
        )}
      </div>
    </div>
  );
}
