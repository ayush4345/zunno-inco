export default function DealingLoader({ status }) {
  return (
    <div className="dealing-loader" role="status">
      <div aria-hidden="true" className="dealing-animation">
        <span className="dealing-deck" />
        <span className="dealing-card dealing-card-one" />
        <span className="dealing-card dealing-card-two" />
        <span className="dealing-card dealing-card-three" />
      </div>
      <div>
        <span className="eyebrow">PRIVATE TABLE</span>
        <strong>Creating your match</strong>
        <small>{status}</small>
      </div>
    </div>
  );
}
