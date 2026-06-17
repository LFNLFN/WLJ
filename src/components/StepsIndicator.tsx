'use client';

interface Step {
    id: number;
    label: string;
    description?: string;
}

interface StepsIndicatorProps {
    steps: Step[];
    currentStep: number;
    onChange?: (step: number) => void;
}

export default function StepsIndicator({ steps, currentStep, onChange }: StepsIndicatorProps) {
    return (
        <div className="w-full">
            <div className="flex items-center justify-between relative mb-8">
                {/* 连接线 */}
                <div className="absolute top-5 left-0 right-0 h-1 bg-gray-200">
                    <div
                        className="h-full bg-[#F08020] transition-all duration-300"
                        style={{
                            width: `${((currentStep - 1) / (steps.length - 1)) * 100}%`,
                        }}
                    />
                </div>

                {/* 步骤节点 */}
                <div className="relative flex justify-between w-full">
                    {steps.map((step, index) => {
                        const stepNumber = index + 1;
                        const isActive = stepNumber === currentStep;
                        const isCompleted = stepNumber < currentStep;

                        return (
                            <div key={step.id} className="flex flex-col items-center">
                                <button
                                    onClick={() => onChange?.(stepNumber)}
                                    className={`relative w-10 h-10 rounded-full font-semibold text-sm flex items-center justify-center transition-all ${isActive
                                            ? 'bg-[#F08020] text-white ring-4 ring-[#F08020] ring-opacity-20'
                                            : isCompleted
                                                ? 'bg-green-500 text-white'
                                                : 'bg-gray-200 text-gray-600'
                                        }`}
                                >
                                    {isCompleted ? (
                                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                        </svg>
                                    ) : (
                                        stepNumber
                                    )}
                                </button>
                                <div className="mt-2 text-center">
                                    <p className={`text-sm font-medium ${isActive ? 'text-[#F08020]' : 'text-gray-600'}`}>
                                        {step.label}
                                    </p>
                                    {step.description && (
                                        <p className="text-xs text-gray-400 mt-1">{step.description}</p>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
