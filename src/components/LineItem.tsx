export type LineDetails = {
    date: string;
    minutesCount: number;
};

type Props = {
    lineDetails: LineDetails;
    lineKey: string;
    onDateChange: (key: string, newDate: string) => void;
    onMinutesChange: (key: string, newMinutes: string | number) => void;
};

export default function LineItem({ lineDetails, lineKey, onDateChange, onMinutesChange }: Props) {
    return (
        <div className="line-item" style={{ display: "flex", alignItems: "center" }}>
            <input
                type="date"
                value={lineDetails.date}
                onChange={e => onDateChange(lineKey, e.target.value)}
                style={{ position: 'relative', zIndex: 2, pointerEvents: 'auto' }}
            />
            <input
                type="number"
                min="0"
                value={lineDetails.minutesCount}
                onChange={e => onMinutesChange(lineKey, e.target.value)}
                style={{ width: "80px", marginLeft: "8px" }}
            />
            <span style={{ marginBottom: "20px" }}>&nbsp; &nbsp;minutes</span>
        </div>
    );
}
