import React from "react";
import { useNavigate } from "react-router-dom";
import { Fingerprint, ShieldCheck, Zap, Globe, Lock, Terminal, ArrowRight } from "lucide-react";

export function Landing() {
  const navigate = useNavigate();

  return (
    <div className="bg-surface">
      <section className="relative min-h-[870px] flex items-center bg-primary overflow-hidden">
        <div className="absolute inset-0 opacity-40">
          <img
            className="w-full h-full object-cover grayscale"
            src="https://picsum.photos/seed/monolith-hero/1920/1080?grayscale"
            alt="Infrastructure"
            referrerPolicy="no-referrer"
          />
        </div>
        <div className="relative z-10 container mx-auto px-6 lg:px-12 flex flex-col items-start py-20">
          <p className="text-white font-black tracking-[0.3em] uppercase mb-4 text-sm bg-primary-container px-3 py-1">
            Protocol: Zero Friction
          </p>
          <h1 className="text-5xl sm:text-7xl md:text-8xl lg:text-9xl font-black text-white leading-none tracking-tighter max-w-4xl uppercase">
            No card,
            <br />
            no phone,
            <br />
            no friction.
          </h1>
          <div className="mt-12 flex flex-col sm:flex-row gap-4">
            <button
              onClick={() => navigate("/register")}
              className="bg-white text-primary px-10 py-5 font-black uppercase tracking-tighter text-xl active:scale-95 transition-transform"
            >
              Get Started
            </button>
            <button
              onClick={() => navigate("/login")}
              className="border-2 border-white text-white px-10 py-5 font-black uppercase tracking-tighter text-xl hover:bg-white/10 active:scale-95 transition-transform"
            >
              Infrastructure View
            </button>
          </div>
        </div>
      </section>

      <section className="bg-surface-container-highest border-y border-outline-variant/20 py-8 px-6 lg:px-12">
        <div className="container mx-auto grid grid-cols-2 md:grid-cols-4 gap-8">
          {[
            { val: "0.3s", label: "Auth Speed" },
            { val: "99.9%", label: "Uptime Core" },
            { val: "AES-256", label: "Encryption" },
            { val: "12M+", label: "Daily Trips" },
          ].map((stat) => (
            <div key={stat.label} className="flex flex-col">
              <span className="text-primary font-black text-4xl leading-none">{stat.val}</span>
              <span className="text-on-surface-variant font-bold text-xs uppercase tracking-widest mt-2">
                {stat.label}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="py-24 px-6 lg:px-12">
        <div className="container mx-auto">
          <div className="mb-16">
            <span className="text-primary font-bold uppercase tracking-widest text-sm block mb-2">
              Core Ecosystem
            </span>
            <h2 className="text-4xl md:text-5xl font-black text-primary tracking-tighter uppercase max-w-2xl">
              The Architecture of Modern Movement
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="md:col-span-8 bg-surface-container-low p-8 lg:p-12 group hover:bg-surface-container-high transition-colors">
              <Fingerprint className="text-primary w-12 h-12 mb-6" />
              <h3 className="text-3xl font-black text-primary uppercase mb-4">Biometric Authentication</h3>
              <p className="text-on-surface-variant text-lg max-w-xl leading-relaxed">
                Multi-modal facial and palm-vein recognition. Our sovereign AI engine identifies users in milliseconds,
                even in high-congestion transit hubs.
              </p>
              <div className="mt-8 pt-8 border-t border-outline-variant/30 flex justify-between items-center">
                <span className="text-xs font-bold tracking-widest uppercase">Encryption Active: RSA-4096</span>
                <ArrowRight className="w-5 h-5" />
              </div>
            </div>
            <div className="md:col-span-4 bg-primary-container p-8 lg:p-12 text-white">
              <Zap className="w-10 h-10 mb-6" />
              <h3 className="text-2xl font-black uppercase mb-4">Contactless Entry</h3>
              <p className="opacity-70 text-sm leading-relaxed">
                No physical interaction required. Infrared proximity gates recognize authorized profiles from a distance
                of 1.5 meters.
              </p>
            </div>
            <div className="md:col-span-4 bg-surface-container-highest p-8 lg:p-12">
              <ShieldCheck className="text-primary w-10 h-10 mb-6" />
              <h3 className="text-2xl font-black text-primary uppercase mb-4">Smart Fare</h3>
              <p className="text-on-surface-variant text-sm leading-relaxed">
                Dynamic pricing algorithms calculate the most efficient route and fare automatically based on real-time
                transit load.
              </p>
            </div>
            <div className="md:col-span-4 bg-white p-8 lg:p-12 shadow-sm border border-outline-variant/10">
              <Lock className="text-primary w-10 h-10 mb-6" />
              <h3 className="text-2xl font-black text-primary uppercase mb-4">Digital Wallet</h3>
              <p className="text-on-surface-variant text-sm leading-relaxed">
                Integrated fiat settlement, auto reload, and live balance controls ensure every trip clears instantly.
              </p>
            </div>
            <div className="md:col-span-4 bg-surface-container-low p-8 lg:p-12">
              <Globe className="text-primary w-10 h-10 mb-6" />
              <h3 className="text-2xl font-black text-primary uppercase mb-4">Live Monitoring</h3>
              <p className="text-on-surface-variant text-sm leading-relaxed">
                Real-time trip telemetry provided directly to your command console. Track every segment of your transit
                path.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-24 bg-primary text-white overflow-hidden relative">
        <div className="container mx-auto px-6 lg:px-12">
          <div className="flex flex-col md:flex-row justify-between items-end mb-20">
            <div>
              <span className="text-white/60 font-bold uppercase tracking-widest text-sm block mb-2">
                Operational Logic
              </span>
              <h2 className="text-4xl md:text-5xl font-black tracking-tighter uppercase">System Workflow</h2>
            </div>
            <div className="text-right hidden md:block">
              <p className="text-white/40 font-mono text-xs uppercase">Sequence ID: MT-9912-A</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-1">
            {[
              { id: "01", title: "Registration", desc: "Initial identity verification through government-issued ID scanning." },
              { id: "02", title: "Enrollment", desc: "High-fidelity biometric signature capture and credential binding." },
              { id: "03", title: "Entry", desc: "Automated gate release upon biometric detection at the station terminal." },
              { id: "04", title: "Tracking", desc: "Real-time trip validation across the network and fare zones." },
              { id: "05", title: "Exit", desc: "Final fare settlement and automated departure logging." },
            ].map((step) => (
              <div key={step.id} className="bg-primary-container p-8 border-l-4 border-white/20 hover:border-white transition-colors">
                <span className="text-xs font-black mb-4 block text-white/40 tracking-widest">{step.id}</span>
                <h4 className="text-xl font-black uppercase mb-3">{step.title}</h4>
                <p className="text-white/60 text-xs leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24 px-6 lg:px-12 bg-white">
        <div className="container mx-auto flex flex-col md:flex-row items-center gap-16">
          <div className="w-full md:w-1/2">
            <img
              className="w-full h-[500px] object-cover grayscale"
              src="https://picsum.photos/seed/monolith-servers/800/1000?grayscale"
              alt="Servers"
              referrerPolicy="no-referrer"
            />
          </div>
          <div className="w-full md:w-1/2">
            <span className="text-primary font-bold uppercase tracking-widest text-sm block mb-2">The Tech Stack</span>
            <h2 className="text-5xl md:text-6xl font-black text-primary tracking-tighter uppercase mb-8">
              Infrastructure of Confidence
            </h2>
            <ul className="space-y-6">
              {[
                {
                  icon: ShieldCheck,
                  title: "Sovereign Cloud Engine",
                  desc: "Decentralized processing ensures system survival even during regional outages.",
                },
                {
                  icon: Lock,
                  title: "Quantum-Safe Encryption",
                  desc: "Ready for the next era of cryptographic challenges. Your data remains your own.",
                },
                {
                  icon: Terminal,
                  title: "Edge Node Validation",
                  desc: "Processing happens at the gate, reducing latency to near-zero levels.",
                },
              ].map((item) => (
                <li key={item.title} className="flex items-start gap-4">
                  <item.icon className="text-primary w-6 h-6 mt-1" />
                  <div>
                    <span className="font-black uppercase text-sm block">{item.title}</span>
                    <p className="text-on-surface-variant text-sm">{item.desc}</p>
                  </div>
                </li>
              ))}
            </ul>
            <button className="mt-12 bg-primary text-white px-12 py-5 font-black uppercase tracking-tighter text-lg active:scale-95 transition-transform">
              Request Deployment Specs
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
