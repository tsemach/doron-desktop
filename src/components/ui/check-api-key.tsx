import { useNavigate } from "react-router-dom";

type Props = {
  apiKey: string;
};

export default function CheckApiKey({ apiKey }: Props) {
  const navigate = useNavigate();

  if (apiKey) return null;

  return (
    <div className="mb-4 rounded-md border border-yellow-400 bg-yellow-50 px-4 py-2 text-sm text-yellow-800">
      No API key set —{" "}
      <button className="underline font-medium" onClick={() => navigate("/settings")}>
        go to Settings
      </button>{" "}
      to add your Claude API key before scanning.
    </div>
  );
}
