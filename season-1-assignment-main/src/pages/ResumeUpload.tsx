import React, { useState, useCallback, useRef } from 'react';
import { 
  Upload, File as FileIcon, CheckCircle2, Loader2, Zap, 
  FolderOpen, AlertCircle, Trash2, ArrowRight, Layers
} from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { useNavigate } from 'react-router-dom';
import { candidateService } from '../services/candidateService';
import { extractResumeData } from '../lib/groq';
import { parseResume } from '../lib/parser';
import { jobRoleService } from '../services/jobRoleService';
import { aiRankingService } from '../services/aiRankingService';
import type { JobRole } from '../types';
import toast from 'react-hot-toast';

interface FileState {
  file: File;
  id: string;
  status: 'ready' | 'uploading' | 'parsing' | 'analyzing' | 'done' | 'error';
  progress: number;
  error?: string;
}

export default function ResumeUpload() {
  const [files, setFiles] = useState<FileState[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [roles, setRoles] = useState<JobRole[]>([]);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Load roles on mount
  React.useEffect(() => {
    jobRoleService.getRoles().then(setRoles).catch(console.error);
  }, []);

  const addFiles = (newFiles: File[]) => {
    const states: FileState[] = newFiles.map(f => ({
      file: f,
      id: Math.random().toString(36).substr(2, 9),
      status: 'ready',
      progress: 0
    }));
    setFiles(prev => [...prev, ...states]);
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    addFiles(acceptedFiles);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/msword': ['.doc'],
      'application/zip': ['.zip']
    }
  });

  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const folderFiles = Array.from(e.target.files).filter(f => 
        f.name.endsWith('.pdf') || f.name.endsWith('.docx') || f.name.endsWith('.doc')
      );
      addFiles(folderFiles);
    }
  };

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const updateFileStatus = (id: string, status: FileState['status'], progress: number = 0, error?: string) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, status, progress, error } : f));
  };

  const handleUpload = async () => {
    if (!selectedRole) {
      toast.error('Please select a job role first');
      return;
    }
    if (files.length === 0) {
      toast.error('No files selected');
      return;
    }

    setIsProcessing(true);
    let successCount = 0;
    let failCount = 0;
    let emptyCount = 0;

    try {
      // 1. Pre-process ZIP files into individual files
      const finalFileList: FileState[] = [];
      for (const fState of files) {
        if (fState.file.name.endsWith('.zip')) {
          updateFileStatus(fState.id, 'uploading', 50);
          console.log("Expanding ZIP archive:", fState.file.name);
          const extracted = await candidateService.processZipFile(fState.file);
          const newStates: FileState[] = extracted.map(f => ({
            file: f,
            id: Math.random().toString(36).substr(2, 9),
            status: 'ready',
            progress: 0
          }));
          finalFileList.push(...newStates);
        } else {
          finalFileList.push(fState);
        }
      }

      setFiles(finalFileList);

      for (const fState of finalFileList) {
        if (fState.status === 'done') {
          successCount++;
          continue;
        }

        try {
          console.log("--- Processing file:", fState.file.name, `(${fState.file.size} bytes) ---`);

          // 🛡️ MANDATORY: Validate File Size
          if (!fState.file || fState.file.size === 0) {
            console.error("Invalid file: Empty (0 bytes)");
            updateFileStatus(fState.id, 'error', 0, 'Empty file rejected');
            emptyCount++;
            continue;
          }

          // STEP 1: Uploading
          updateFileStatus(fState.id, 'uploading', 20);
          const resumeUrl = await candidateService.uploadResume(fState.file, fState.file.name);
          console.log("File uploaded successfully:", resumeUrl);
          
          // STEP 2: Parsing (Text Extraction)
          updateFileStatus(fState.id, 'parsing', 40);
          const rawText = await parseResume(fState.file, fState.file.type, fState.file.name);
          
          // 🛡️ MANDATORY: Validate Extracted Text
          if (!rawText || rawText.trim().length < 20) {
            console.error("PDF text extraction failed: No readable text found.");
            throw new Error("PDF text extraction failed (empty or corrupt)");
          }
          console.log("Text extraction complete. Character count:", rawText.length);

          // STEP 3: AI Data Extraction
          updateFileStatus(fState.id, 'parsing', 70);
          const parsedData = await extractResumeData(rawText);
          console.log("AI parsing complete:", parsedData.name || "Unknown");
          
          // STEP 4: Database Insert (Analyzing)
          updateFileStatus(fState.id, 'analyzing', 90);
          await candidateService.createCandidate({
            name: parsedData.name || fState.file.name.split('.')[0],
            email: parsedData.email || `${fState.file.name.split('.')[0]}@example.com`,
            phone: parsedData.phone || '',
            score: parsedData.score || 0,
            summary: parsedData.summary || '',
            skills: parsedData.skills || [],
            projects: parsedData.projects || [],
            years_experience: String(parsedData.years_experience || ''),
            raw_text: rawText,
            resume_url: resumeUrl,
            received_at: new Date().toISOString(),
            education: parsedData.education || '',
            certifications: parsedData.certifications || [],
            companies: parsedData.companies || [],
            tech_stack: parsedData.tech_stack || [],
            keywords: parsedData.keywords || [],
          } as any);

          console.log("Candidate processed successfully.");
          updateFileStatus(fState.id, 'done', 100);
          successCount++;

        } catch (err: any) {
          console.error(`Error processing ${fState.file.name}:`, err.message);
          updateFileStatus(fState.id, 'error', 0, err.message || 'Processing failed');
          failCount++;
        }
      }
      
      if (successCount > 0) {
        toast.loading(`Ranking ${successCount} candidates...`, { duration: 2000 });
        
        // 🔮 Trigger Pipeline
        await aiRankingService.processRankingPipeline(selectedRole);
        
        toast.success(
          `${successCount} successful | ${failCount} failed | ${emptyCount} empty files rejected.`, 
          { duration: 5000 }
        );
        
        // 🔥 Immediate Navigation
        setTimeout(() => {
          navigate(`/shortlist?role=${selectedRole}`);
        }, 800);

      } else {
        toast.error(`Processing failed: ${failCount} errors, ${emptyCount} empty files.`);
      }

    } catch (error) {
      console.error('Batch upload error:', error);
      toast.error('Critical batch processing failure');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-brand-400/20 flex items-center justify-center">
            <Upload className="h-6 w-6 text-brand-400" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Bulk Resume Import</h1>
        </div>
        <p className="text-white/50 max-w-2xl font-medium">
          Choose between individual files, complete folders, or ZIP archives. Our AI will automatically parse and rank every candidate.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          {/* Main Dropzone */}
          <div
            {...getRootProps()}
            className={`group relative overflow-hidden rounded-[2rem] border-2 border-dashed transition-all duration-500 ${
              isDragActive 
                ? 'border-brand-400 bg-brand-400/10 scale-[0.99]' 
                : 'border-white/10 hover:border-brand-400/40 bg-white/[0.02] hover:bg-brand-400/[0.02]'
            }`}
          >
            <input {...getInputProps()} />
            <div className="p-16 flex flex-col items-center justify-center text-center space-y-6">
              <div className="relative">
                <div className="absolute inset-0 bg-brand-400/20 blur-2xl rounded-full group-hover:scale-150 transition-transform duration-500" />
                <div className="relative h-20 w-20 rounded-3xl bg-brand-400/20 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                  <Upload className="h-10 w-10 text-brand-400" />
                </div>
              </div>
              
              <div className="space-y-2">
                <p className="text-2xl font-bold text-white tracking-tight">
                  {isDragActive ? 'Drop your resumes here' : 'Drag & drop resumes here'}
                </p>
                <p className="text-white/40 font-medium italic">
                  or click to browse your local storage
                </p>
              </div>

              <div className="flex items-center gap-4 pt-4">
                <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-[10px] font-bold text-white/40 tracking-widest uppercase">
                  <FileIcon className="h-3 w-3" /> PDF / DOCX
                </div>
                <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-[10px] font-bold text-white/40 tracking-widest uppercase">
                  <Layers className="h-3 w-3" /> ZIP Archives
                </div>
              </div>
            </div>
          </div>

          {/* Alternative Upload Methods */}
          <div className="grid grid-cols-2 gap-4">
            <button 
              onClick={() => folderInputRef.current?.click()}
              className="flex items-center justify-between p-6 rounded-3xl bg-white/[0.02] border border-white/10 hover:border-brand-400/30 hover:bg-brand-400/5 transition-all duration-300 group"
            >
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-brand-400/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <FolderOpen className="h-6 w-6 text-brand-400" />
                </div>
                <div className="text-left">
                  <p className="text-white font-bold tracking-tight">Upload Folder</p>
                  <p className="text-xs text-white/30">Bulk import directory</p>
                </div>
              </div>
              <ArrowRight className="h-5 w-5 text-white/10 group-hover:text-brand-400 transition-colors" />
            </button>
            <input 
              type="file" 
              ref={folderInputRef} 
              style={{ display: 'none' }} 
              // @ts-ignore - webkitdirectory is a non-standard but widely supported attribute
              webkitdirectory="" 
              // @ts-ignore
              directory="" 
              multiple 
              onChange={handleFolderSelect}
            />

            <div className="flex items-center justify-between p-6 rounded-3xl bg-white/[0.02] border border-white/10 opacity-50 cursor-not-allowed">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-white/5 flex items-center justify-center">
                  <Layers className="h-6 w-6 text-white/20" />
                </div>
                <div className="text-left">
                  <p className="text-white/40 font-bold tracking-tight">Merged PDF Split</p>
                  <p className="text-xs text-white/20">Coming soon</p>
                </div>
              </div>
            </div>
          </div>

          {/* File Preview List */}
          {files.length > 0 && (
            <div className="bg-slate-900/40 border border-white/10 rounded-[2rem] overflow-hidden animate-in zoom-in-95 duration-500">
              <div className="p-6 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-white tracking-tight">{files.length} Candidates Selected</span>
                  <div className="h-1.5 w-1.5 rounded-full bg-brand-400 shadow-[0_0_8px_#6366f1]" />
                </div>
                <button 
                  onClick={() => setFiles([])}
                  className="text-xs font-bold text-white/20 hover:text-red-400 transition-colors uppercase tracking-widest"
                >
                  Clear All
                </button>
              </div>
              <div className="max-height-[500px] overflow-y-auto p-4 space-y-3 custom-scrollbar">
                {files.map((f) => (
                  <div key={f.id} className="relative group bg-white/[0.02] hover:bg-white/[0.04] border border-white/5 hover:border-white/10 rounded-2xl p-4 transition-all duration-300">
                    <div className="flex items-center justify-between relative z-10">
                      <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-xl bg-white/5 flex items-center justify-center">
                          <FileIcon className="h-6 w-6 text-white/20" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-white truncate max-w-[240px]">{f.file.name}</span>
                          <span className="text-[10px] text-white/20 font-bold uppercase tracking-widest">{(f.file.size / 1024 / 1024).toFixed(1)} MB</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-6">
                        {f.status !== 'ready' && (
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] font-bold text-brand-400 uppercase tracking-widest animate-pulse">
                              {f.status === 'uploading' && 'Syncing...'}
                              {f.status === 'parsing' && 'Extracting...'}
                              {f.status === 'analyzing' && 'AI Scoring...'}
                            </span>
                            <div className="h-8 w-8 rounded-full border-2 border-white/5 flex items-center justify-center p-1.5">
                              {f.status === 'done' ? (
                                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                              ) : f.status === 'error' ? (
                                <AlertCircle className="h-5 w-5 text-red-400" />
                              ) : (
                                <Loader2 className="h-5 w-5 text-brand-400 animate-spin" />
                              )}
                            </div>
                          </div>
                        )}
                        
                        {!isProcessing && (
                          <button 
                            onClick={() => removeFile(f.id)}
                            className="p-2.5 rounded-xl hover:bg-red-500/10 text-white/10 hover:text-red-400 transition-all opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                    
                    {/* Inline Progress Bar */}
                    {f.status !== 'ready' && f.status !== 'done' && f.status !== 'error' && (
                      <div className="absolute inset-0 bg-brand-400/5 rounded-2xl overflow-hidden pointer-events-none">
                        <div 
                          className="h-full bg-brand-400/10 transition-all duration-700"
                          style={{ width: `${f.progress}%` }}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-white/10 rounded-[2rem] p-8 space-y-8 sticky top-8 shadow-2xl shadow-black/50">
            <div className="space-y-4">
              <label className="text-xs font-bold text-white/30 uppercase tracking-widest px-1">Active Job Role</label>
              <div className="relative">
                <select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 hover:border-brand-400/50 rounded-2xl px-5 py-4 text-white font-semibold focus:ring-2 focus:ring-brand-400 outline-none transition-all appearance-none cursor-pointer"
                >
                  <option value="" className="bg-slate-950">Choose Target Role...</option>
                  {roles.map(role => (
                    <option key={role.id} value={role.id} className="bg-slate-950">{role.title}</option>
                  ))}
                </select>
                <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-white/20">
                   <ChevronDown className="h-5 w-5" />
                </div>
              </div>
            </div>

            <div className="pt-4 space-y-6">
              {isProcessing && (
                <div className="space-y-3">
                  <div className="flex justify-between items-end">
                    <div className="space-y-1">
                       <p className="text-sm font-bold text-white">Batch Processing</p>
                       <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest">Global Progress Indicator</p>
                    </div>
                    <span className="text-brand-400 font-black text-xl">
                      {files.length > 0 ? Math.round((files.filter(f => f.status === 'done').length / files.length) * 100) : 0}%
                    </span>
                  </div>
                  <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-brand-400 to-brand-300 transition-all duration-1000 ease-out"
                      style={{ width: `${files.length > 0 ? (files.filter(f => f.status === 'done' || f.status === 'parsing' || f.status === 'analyzing').length / files.length) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              )}

              <button
                onClick={handleUpload}
                disabled={isProcessing || files.length === 0 || !selectedRole}
                className={`w-full flex items-center justify-center gap-3 rounded-[1.25rem] px-8 py-5 font-black text-sm uppercase tracking-widest transition-all duration-500 shadow-xl ${
                  isProcessing || files.length === 0 || !selectedRole
                    ? 'bg-white/5 text-white/10 cursor-not-allowed border border-white/5'
                    : 'bg-brand-400 text-slate-950 hover:bg-brand-300 shadow-brand-400/20 hover:-translate-y-1 active:scale-95'
                }`}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    AI is Analyzing...
                  </>
                ) : (
                  <>
                    <Zap className="h-5 w-5" />
                    Begin Intelligence Import
                  </>
                )}
              </button>
            </div>

            <div className="pt-4 border-t border-white/5 space-y-4">
              <div className="flex items-start gap-4 p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/10 transition-colors group">
                <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
                <p className="text-xs text-emerald-500/80 leading-relaxed font-medium">
                  AI will extract skills, experience and contact info automatically.
                </p>
              </div>
              <div className="flex items-start gap-4 p-4 rounded-2xl bg-brand-400/5 border border-brand-400/10 transition-colors group">
                <AlertCircle className="h-5 w-5 text-brand-400 shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
                <p className="text-xs text-brand-400/80 leading-relaxed font-medium">
                  Duplicate entries will be automatically merged or flagged in the dashboard.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Simple Helper Component
function ChevronDown({ className }: { className?: string }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width="24" 
      height="24" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <path d="m6 9 6 6 6-6"/>
    </svg>
  );
}
