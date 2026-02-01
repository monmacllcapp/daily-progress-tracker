import { useNavigate } from 'react-router-dom';
import { MorningFlow } from '../components/MorningFlow';

export default function MorningFlowPage() {
  const navigate = useNavigate();

  const handleComplete = () => {
    const today = new Date().toISOString().split('T')[0];
    localStorage.setItem(
      'morning_flow_completed',
      JSON.stringify({ date: today, completed: true })
    );
    localStorage.setItem('last_reset_date', today);
    navigate('/');
  };

  return <MorningFlow onComplete={handleComplete} />;
}
