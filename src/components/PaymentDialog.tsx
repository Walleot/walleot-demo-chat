"use client";

import { PaymentElicitation } from "@/types/elicitattion";
import { useState } from "react";

interface PaymentDialogProps {
    elicitation: PaymentElicitation | null;
    setElicitation: (val: PaymentElicitation | null) => void;
}

export const PaymentDialog = ({ elicitation, setElicitation }: PaymentDialogProps) => {

    const [error, setError] = useState('');
    const [clicked, setClicked] = useState(false);

    if (!elicitation) return null


    const respond = async (action:string) => {
        try {
            await fetch("/api/elicitation", {
                method: "POST",
                body: JSON.stringify({ payment_id : elicitation.payment_id, data: {action} }),
                headers: { "Content-Type": "application/json" },
            });
            setElicitation(null);
            setClicked(false);
        } catch (err: any) {
            setError(err.message ?? 'Unknown error');
        }
    }

    const cancelPayment = () => {
        setElicitation(null);//closing anyway
        respond('cancel')
    }

    const confirmPayment = () => {
        respond('accept')
    }


    return (
        <div
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
            onClick={cancelPayment}
        >
            <div
                className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6 relative"
                onClick={(e) => e.stopPropagation()}
            >
                <h2 className="text-xl font-semibold mb-4">Payment Required</h2>
                <p className="mb-6">{elicitation?.message || "To continue, please follow the link to complete the payment"}</p>
                <a
                    href={elicitation?.url}
                    className="font-semibold text-blue-600 hover:text-blue-700 transition"
                    target="_blank"
                    onClick={()=>setClicked(true)}
                >
                    {elicitation?.url}
                </a>
                {error &&
                    <div className="p-2 bg-red-200 border border-red-400 rounded">{error}</div>
                }
                <div className="flex justify-end gap-3 pt-5">
                    <button
                        className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 transition"
                        onClick={cancelPayment}
                    >
                        Cancel
                    </button>
                    <button
                        className={`px-4 py-2 text-white rounded ${clicked? "bg-blue-600 hover:bg-blue-700 transition": "bg-gray-400 cursor-not-allowed"}`}
                        {...(clicked?{}:{title:"Please follow the link above"})}
                        onClick={confirmPayment}
                        disabled={!clicked}
                    >
                        Confirm Payment
                    </button>
                </div>
            </div>
        </div>
    )
}