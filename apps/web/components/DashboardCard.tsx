type DashboardCardProps = {
  title: string;
  value: string;
};

export default function DashboardCard({
  title,
  value,
}: DashboardCardProps) {
  return (
    <div
      style={{
        background: "white",
        padding: "20px",
        borderRadius: "10px",
        boxShadow: "0 2px 10px rgba(0,0,0,.1)",
      }}
    >
      <h3>{title}</h3>

      <h1>{value}</h1>
    </div>
  );
}