import IntakeForm from "../components/IntakeForm";

export default function IntakePage() {
  const token = localStorage.getItem("diet.token") || "";
  if (!token) {
    return <div className="p-4 text-red-200">Not authenticated. Please log in.</div>;
  }
  return (
    <div className="p-4">
      <IntakeForm token={token} />
    </div>
  );
}
