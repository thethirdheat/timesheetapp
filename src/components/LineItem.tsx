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
        <div>
            <input
                type="date"
                value={lineDetails.date}
                onChange={e => onDateChange(lineKey, e.target.value)}
            />
            <input
                type="number"
                min="0"
                value={lineDetails.minutesCount}
                onChange={e => onMinutesChange(lineKey, e.target.value)}
                style={{ width: "60px", marginLeft: "8px" }}
            />
            <span> minutes</span>
        </div>
    );
}
