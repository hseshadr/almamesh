import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker as MuiDatePicker } from '@mui/x-date-pickers/DatePicker';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import dayjs, { Dayjs } from 'dayjs';
import { colors } from '@almamesh/constants';

interface BirthDatePickerProps {
  value: Date | null;
  onChange: (date: Date | null) => void;
  className?: string;
}

// Custom dark theme matching the app's design (same as TimePicker)
const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: colors.accent.gold, // Gold accent
    },
    background: {
      default: colors.background.tertiary,
      paper: colors.background.tertiary,
    },
    text: {
      primary: colors.text.body,
      secondary: colors.text.secondary,
    },
  },
  components: {
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            backgroundColor: colors.background.tertiary,
            borderRadius: '0.5rem',
            fontSize: '1.125rem',
            '& fieldset': {
              borderColor: colors.ui.border,
            },
            '&:hover fieldset': {
              borderColor: colors.ui.borderLight,
            },
            '&.Mui-focused fieldset': {
              borderColor: colors.accent.gold,
              borderWidth: '2px',
            },
          },
          '& .MuiOutlinedInput-input': {
            color: colors.text.body,
            padding: '16px',
          },
          '& .MuiInputAdornment-root .MuiSvgIcon-root': {
            color: colors.text.secondary,
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundColor: colors.background.tertiary,
          border: `1px solid ${colors.ui.border}`,
          borderRadius: '0.5rem',
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          color: colors.text.secondary,
          '&:hover': {
            backgroundColor: 'rgba(201, 162, 39, 0.1)',
          },
        },
      },
    },
    MuiTypography: {
      styleOverrides: {
        root: {
          color: colors.text.body,
        },
      },
    },
  },
});

// Calendar-specific styles via sx props
const calendarSx = {
  backgroundColor: colors.background.tertiary,
  // Day cells
  '& .MuiPickersDay-root': {
    color: colors.text.body,
    '&:hover': {
      backgroundColor: colors.ui.border,
    },
    '&.Mui-selected': {
      backgroundColor: colors.accent.gold,
      color: colors.background.tertiary,
      fontWeight: 600,
      '&:hover': {
        backgroundColor: colors.accent['gold-bright'],
      },
    },
    '&.MuiPickersDay-today': {
      borderColor: colors.accent.gold,
    },
  },
  // Week day labels
  '& .MuiDayCalendar-weekDayLabel': {
    color: colors.text.secondary,
  },
  // Calendar header
  '& .MuiPickersCalendarHeader-root': {
    color: colors.text.body,
  },
  '& .MuiPickersCalendarHeader-switchViewButton': {
    color: colors.text.body,
  },
  '& .MuiPickersCalendarHeader-label': {
    color: colors.text.body,
  },
  // Year picker
  '& .MuiPickersYear-yearButton': {
    color: colors.text.body,
    '&:hover': {
      backgroundColor: colors.ui.border,
    },
    '&.Mui-selected': {
      backgroundColor: colors.accent.gold,
      color: colors.background.tertiary,
      fontWeight: 600,
      '&:hover': {
        backgroundColor: colors.accent['gold-bright'],
      },
    },
  },
  // Month picker
  '& .MuiPickersMonth-monthButton': {
    color: colors.text.body,
    '&:hover': {
      backgroundColor: colors.ui.border,
    },
    '&.Mui-selected': {
      backgroundColor: colors.accent.gold,
      color: colors.background.tertiary,
      fontWeight: 600,
      '&:hover': {
        backgroundColor: colors.accent['gold-bright'],
      },
    },
  },
};

/**
 * Birth date picker component using MUI X DatePicker
 * Accepts and returns Date objects (native JavaScript Date)
 * Displays in MM/DD/YYYY format
 */
export function BirthDatePicker({ value, onChange, className }: BirthDatePickerProps) {
  // Convert Date to Dayjs for the picker
  const dateToDayjs = (date: Date | null): Dayjs | null => {
    if (!date) return null;
    return dayjs(date);
  };

  // Convert Dayjs to Date
  const dayjsToDate = (d: Dayjs | null): Date | null => {
    if (!d || !d.isValid()) return null;
    return d.toDate();
  };

  const handleChange = (newValue: Dayjs | null) => {
    onChange(dayjsToDate(newValue));
  };

  return (
    <ThemeProvider theme={darkTheme}>
      <LocalizationProvider dateAdapter={AdapterDayjs}>
        <div className={className || "w-full"}>
          <MuiDatePicker
            value={dateToDayjs(value)}
            onChange={handleChange}
            format="MM/DD/YYYY"
            maxDate={dayjs()}
            minDate={dayjs('1900-01-01')}
            openTo="year"
            views={['year', 'month', 'day']}
            yearsOrder="desc"
            slotProps={{
              textField: {
                placeholder: 'Select your birth date',
                fullWidth: true,
                InputProps: {
                  sx: {
                    '& input::placeholder': {
                      color: colors.text.muted,
                      opacity: 1,
                    },
                  },
                },
              },
              popper: {
                sx: {
                  zIndex: 1300,
                  '& .MuiPaper-root': {
                    backgroundColor: colors.background.tertiary,
                    border: `1px solid ${colors.ui.border}`,
                    borderRadius: '0.5rem',
                  },
                },
              },
              layout: {
                sx: {
                  backgroundColor: colors.background.tertiary,
                },
              },
              toolbar: {
                sx: {
                  backgroundColor: colors.background.elevated,
                  borderBottom: `1px solid ${colors.ui.border}`,
                  '& .MuiTypography-root': {
                    color: colors.text.body,
                  },
                },
              },
              actionBar: {
                sx: {
                  backgroundColor: colors.background.tertiary,
                  borderTop: `1px solid ${colors.ui.border}`,
                },
              },
            }}
            sx={{
              width: '100%',
              '& .MuiPickersLayout-contentWrapper': calendarSx,
            }}
          />
        </div>
      </LocalizationProvider>
    </ThemeProvider>
  );
}
