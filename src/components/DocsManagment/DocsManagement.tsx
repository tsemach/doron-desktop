import { Button } from "../ui/button";
import { useNavigate } from "react-router-dom";

export default function DocsManagement() {
  const navigate = useNavigate();

  return (
    <div className="flex-1 p-4">
      <div className="flex items-center justify-content mb-4">
        <Button
          variant="ghost"
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 justify-start"
        >
          ← Back
        </Button>
        <Button className="flex items-center gap-1 justify-start" variant="default">
          Scan Documents
        </Button>
      </div>
      <h1 className="text-2xl font-bold mb-4">Documents Management</h1>
      <p>This is the documents management page. Here you can manage all your documents related to your cases.</p>
    </div>
  );
}