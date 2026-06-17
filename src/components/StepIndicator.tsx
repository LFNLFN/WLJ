'use client';

interface Step {
  title: string;
  description?: string;
}

interface StepIndicatorProps {
  steps: Step[];
  currentStep: number;
  onStepClick?: (step: number) => void;
}

export default function StepIndicator({ steps, currentStep, onStepClick }: StepIndicatorProps) {
  return (
    <div className="w-full">
      <div className="flex items-center justify-between">
        {steps.map((step, index) => (
          <div key={index} className="flex-1 flex items-center">
            {/* 步骤节点 */}
            <div className="flex flex-col items-center relative">
              <button
                type="button"
                onClick={() => onStepClick?.(index)}
                disabled={!onStepClick}
                className={`
                  w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold border-2 
                  transition-all duration-300 ease-in-out
                  ${index < currentStep
                    ? 'bg-[#F08020] border-[#F08020] text-white shadow-md'
                    : index === currentStep
                    ? 'bg-white border-[#F08020] text-[#F08020] shadow-md'
                    : 'bg-white border-gray-300 text-gray-400'
                  }
                  ${onStepClick ? 'cursor-pointer hover:shadow-lg' : 'cursor-default'}
                  ${index === currentStep ? 'ring-4 ring-[#F08020]/20' : ''}
                `}
              >
                {index < currentStep ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  index + 1
                )}
              </button>
              {/* 步骤标题 */}
              <div className="absolute top-12 w-max text-center" style={{ transform: 'translateX(-50%)', left: '50%' }}>
                <p className={`
                  text-sm font-medium whitespace-nowrap transition-colors duration-300
                  ${index <= currentStep ? 'text-[#F08020]' : 'text-gray-400'}
                `}>
                  {step.title}
                </p>
                {step.description && (
                  <p className="text-xs text-gray-400 mt-0.5 whitespace-nowrap">{step.description}</p>
                )}
              </div>
            </div>

            {/* 连接线 */}
            {index < steps.length - 1 && (
              <div className="flex-1 h-0.5 mx-4 mt-0 relative" style={{ marginTop: '-2rem' }}>
                <div className="h-full bg-gray-200 rounded-full">
                  <div
                    className="h-full bg-[#F08020] rounded-full transition-all duration-500 ease-in-out"
                    style={{ width: index < currentStep ? '100%' : index === currentStep ? '0%' : '0%' }}
                  />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 当前步骤提示 */}
      <div className="mt-16 text-center">
        <p className="text-sm text-gray-500">
          步骤 {currentStep + 1} / {steps.length}
        </p>
      </div>
    </div>
  );
}
