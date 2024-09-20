import React from 'react';
import { deepmerge } from '@mui/utils';
import { extendTheme as extendJoyTheme } from '@mui/joy/styles';
import {
  createTheme,
  Experimental_CssVarsProvider as CssVarsProvider,
  experimental_extendTheme as extendMuiTheme
} from '@mui/material/styles';
import 'typeface-inter';
import hsl from 'hsl-to-hex';

function dynamicTheme(accessor) {
  const parts = accessor.split('.');
  parts.unshift('--mui');
  return `var(${parts.join('-')})`;
}
const { palette } = createTheme();

const colors = {
  gray0: hsl(200, 0, 0),
  gray5: hsl(200, 0, 5),
  gray7: hsl(200, 0, 7),
  gray10: hsl(200, 0, 10),
  gray12: hsl(200, 0, 12),
  gray15: hsl(200, 0, 15),
  gray20: hsl(200, 0, 20),
  gray30: hsl(200, 0, 30),
  gray40: hsl(200, 0, 40),
  gray50: hsl(200, 0, 50),
  gray60: hsl(200, 0, 60),
  gray70: hsl(200, 0, 70),
  gray80: hsl(200, 0, 80),
  gray85: hsl(200, 0, 85),
  gray90: hsl(200, 0, 90),
  gray93: hsl(200, 0, 93),
  gray95: hsl(200, 0, 95),
  gray98: hsl(200, 0, 98),
  gray99: hsl(200, 0, 99),
  gray100: hsl(200, 0, 100),
  orange51: hsl(25, 100, 51),
  orange45: hsl(25, 100, 45),
  red0: hsl(0, 75, 20),
  red16: hsl(3, 51, 16),
  red82: hsl(3, 96, 82),
  blue20: hsl(199, 53, 20),
  blue56: hsl(200, 92, 56),
  yellow21: hsl(34, 52, 21),
  yellow60: hsl(33, 100, 60),
  green20: hsl(122, 24, 20),
  green46: hsl(155, 35, 46)
};

const themes = {
  dark: {
    primaryBg: colors.gray15,
    primaryHoverBg: colors.gray12,
    secondaryBg: colors.gray10,
    secondaryHoverBg: colors.gray20,
    primaryText: colors.gray100,
    secondaryText: colors.gray70,
    tertiaryText: colors.gray50,
    primaryButtonBg: colors.orange45,
    primaryButtonHoverBg: colors.orange51,
    linkText: colors.gray100,
    linkHoverText: colors.gray90,
    itemBg: colors.gray20,
    itemText: colors.gray20,
    dividerPrimary: colors.gray20,
    dividerSecondary: colors.gray50,
    shadow: colors.gray5,
    shadowDark: colors.gray5,
    inputBg: colors.gray5,
    inputBorder: colors.gray5,
    inputBorderHover: colors.gray20,
    alertDangerBg: colors.gray7,
    alertInfoBg: colors.gray7,
    alertWarningBg: colors.gray7,
    alertSuccessBg: colors.gray7,
    alertInfoBorder: colors.blue20,
    alertWarningBorder: colors.yellow21,
    alertErrorBorder: colors.red16,
    alertSuccessBorder: colors.green20,
    loaderPrimary: colors.gray60,
    loaderSecondary: colors.gray20
  },
  light: {
    primaryBg: colors.gray100,
    primaryHoverBg: colors.gray95,
    secondaryBg: colors.gray98,
    secondaryHoverBg: colors.gray95,
    primaryText: colors.gray0,
    secondaryText: colors.gray40,
    tertiaryText: colors.gray60,
    primaryButtonBg: colors.orange45,
    primaryButtonHoverBg: colors.orange51,
    linkText: colors.gray0,
    linkHoverText: colors.gray10,
    itemBg: colors.gray90,
    itemText: colors.gray80,
    dividerPrimary: colors.gray90,
    dividerSecondary: colors.gray50,
    shadow: colors.gray85,
    shadowDark: colors.gray40,
    inputBg: colors.gray100,
    inputBorder: colors.gray90,
    inputBorderHover: colors.gray80,
    alertDangerBg: colors.gray100,
    alertInfoBg: colors.gray100,
    alertWarningBg: colors.gray100,
    alertSuccessBg: colors.gray100,
    alertInfoBorder: colors.blue56,
    alertWarningBorder: colors.yellow60,
    alertErrorBorder: colors.red82,
    alertSuccessBorder: colors.green46,
    loaderPrimary: colors.gray20,
    loaderSecondary: colors.gray70
  }
};

const joyTheme = extendJoyTheme({
  colorSchemes: {
    light: {
      palette: {
        success: {
          solidBg: '#2DA44E',
          solidHoverBg: '#2C974B',
          solidActiveBg: '#298E46'
        },
        neutral: {
          outlinedBg: '#F6F8FA',
          outlinedHoverBg: '#F3F4F6',
          outlinedActiveBg: 'rgba(238, 239, 242, 1)',
          outlinedBorder: 'rgba(27, 31, 36, 0.15)'
        },
        focusVisible: 'rgba(3, 102, 214, 0.3)',
        divider: '#EAECF0'
      }
    },
    dark: {
      palette: {
        divider: '#FFFFFF'
      }
    }
  },
  focus: {
    default: {
      outlineWidth: '3px'
    }
  },
  fontFamily: {
    body: '"Palanquin",sans-serif',
    display: '"Palanquin",sans-serif'
  },
  typography: {
    body1: {
      fontSize: 16,
      color: '#101828'
    }
  },
  components: {
    JoyInput: {
      styleOverrides: {
        root: {
          border: `1px solid ${dynamicTheme('palette.divider')}`
        },
        input: {
          '&::placeholder': {
            color: dynamicTheme('palette.text.secondary'),
            fontSize: 14,
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
            overflow: 'hidden'
          }
        }
      }
    },
    JoyButton: {
      styleOverrides: {
        root: ({ ownerState }) => ({
          borderRadius: '6px',
          boxShadow: '0 1px 0 0 rgba(27, 31, 35, 0.04)',
          transition: '80ms cubic-bezier(0.33, 1, 0.68, 1)',
          transitionProperty: 'color,background-color,box-shadow,border-color',
          ...(ownerState.size === 'md' && {
            fontWeight: 'semiBold',
            minHeight: '32px',
            fontSize: '14px',
            '--Button-paddingInline': '1rem'
          }),
          ...(ownerState.color === 'success' &&
            ownerState.variant === 'solid' && {
              '--gh-palette-focusVisible': 'rgba(46, 164, 79, 0.4)',
              border: '1px solid rgba(27, 31, 36, 0.15)',
              '&:active': {
                boxShadow: 'inset 0px 1px 0px rgba(20, 70, 32, 0.2)'
              }
            }),
          ...(ownerState.color === 'neutral' &&
            ownerState.variant === 'outlined' && {
              '&:active': {
                boxShadow: 'none'
              }
            })
        })
      }
    }
  }
});

// Note: you can't put `joyTheme` inside Material UI's `extendMuiTheme(joyTheme)` because
//       some of the values in the Joy UI theme refers to CSS variables and not raw colors.
// TODO:MANI - unify with Joy theme ^?
const muiTheme = extendMuiTheme({
  typography: {
    fontFamily: '"Palanquin",sans-serif',
    // todo: body1 & body fontSize styles are reversed from MUI default
    body1: {
      color: dynamicTheme('palette.text.secondary')
    },
    body2: {
      fontSize: 16,
      color: dynamicTheme('palette.text.primary')
    },
    subtitle1: {
      color: dynamicTheme('palette.text.tertiary')
    },
    fontWeightLight: 300,
    fontWeightRegular: 400,
    fontWeightMedium: 350,
    fontWeightSemiBold: 360,
    fontWeightBold: 370,
    h2: {
      color: dynamicTheme('palette.text.primary')
    },
    h6: {
      color: dynamicTheme('palette.text.primary')
    },
    caption: {
      fontSize: 14,
      color: dynamicTheme('palette.text.secondary')
    }
  },
  colorSchemes: {
    light: {
      palette: {
        divider: themes.light.dividerPrimary,
        // Alert: {
        //   infoIconColor: '#475467',
        //   infoColor: '#475467'
        // },
        grey: {
          primary: '#667085',
          25: '#FCFCFD',
          50: '#F9FAFB',
          100: '#F2F4F7',
          300: '#D0D5DD',
          400: '#98A2B3',
          500: '#667085',
          700: '#344054',
          900: '#101828'
        },
        primary: {
          main: themes.light.primaryText,
          100: '#F2F4F7',
          300: '#D0D5DD',
          500: '#667085',
          600: '#475467'
        },
        success: {
          main: '#027A48', // TODO FIX ME - 500 value
          700: '#027A48'
        },
        error: {
          main: '#B42318',
          25: '#FFFBFA',
          300: '#FDA29B',
          600: '#D92D20',
          700: '#B42318'
        },
        background: {
          primary: themes.light.primaryBg,
          primaryHover: themes.light.primaryHoverBg,
          secondary: themes.light.secondaryBg,
          secondaryHover: themes.light.secondaryHoverBg,
          paper: themes.light.primaryBg,
          item: themes.light.itemBg,
          input: themes.light.inputBg,
          alertDanger: themes.light.alertDangerBg,
          alertInfo: themes.light.alertInfoBg,
          alertWarning: themes.light.alertWarningBg,
          alertSuccess: themes.light.alertSuccessBg,
          overlay: 'hsl(0deg 0% 100% / 90%)'
        },
        secondary: {
          main: themes.light.secondaryText
        },
        text: {
          primary: themes.light.primaryText,
          secondary: themes.light.secondaryText,
          tertiary: themes.light.tertiaryText
        },
        voxel: {
          main: '#FF6D04',
          500: '#FF6D04',
          600: '#D54B00', // Not in the design. Darker shade of 500 of is used
          dangerAlertBg: '#412729', // Not in the design
          dangerAlertBorder: '#764a48' // Not in the design
        },
        queued: {
          main: colors.gray50
        },
        custom: {
          shadow: themes.light.shadow,
          shadowDark: themes.light.shadowDark,
          inputBorder: themes.light.inputBorder,
          inputBorderHover: themes.light.inputBorderHover,
          alertInfoBorder: themes.light.alertInfoBorder,
          alertWarningBorder: themes.light.alertWarningBorder,
          alertErrorBorder: themes.light.alertErrorBorder,
          alertSuccessBorder: themes.light.alertSuccessBorder,
          loaderPrimary: themes.light.loaderPrimary,
          loaderSecondary: themes.light.loaderSecondary
        }
      }
    },
    dark: {
      palette: {
        error: palette.augmentColor({
          color: {
            main: '#B42318',
            25: '#FFFBFA',
            300: '#FDA29B',
            600: '#D92D20',
            700: '#B42318'
          }
        }),
        divider: themes.dark.dividerPrimary,
        primary: {
          main: themes.dark.primaryText
        },
        background: {
          primary: themes.dark.primaryBg,
          primaryHover: themes.dark.primaryHoverBg,
          secondary: themes.dark.secondaryBg,
          secondaryHover: themes.dark.secondaryHoverBg,
          paper: themes.dark.primaryBg,
          item: themes.dark.itemBg,
          input: themes.dark.inputBg,
          alertDanger: themes.dark.alertDangerBg,
          alertInfo: themes.dark.alertInfoBg,
          alertWarning: themes.dark.alertWarningBg,
          alertSuccess: themes.dark.alertSuccessBg,
          overlay: 'hsl(0deg 0% 10% / 95%)'
        },
        secondary: {
          main: themes.dark.secondaryText
        },
        text: {
          primary: themes.dark.primaryText,
          secondary: themes.dark.secondaryText,
          tertiary: themes.dark.tertiaryText
        },
        grey: {
          100: '#5c5f60'
        },
        voxel: {
          main: '#FF6D04',
          500: '#FF6D04',
          600: '#D54B00', // Not in the design. Darker shade of 500 of is used
          dangerAlertBg: '#412729', // Not in the design
          dangerAlertBorder: '#764a48' // Not in the design
        },
        custom: {
          shadow: themes.dark.shadow,
          shadowDark: themes.dark.shadowDark,
          inputBorder: themes.dark.inputBorder,
          inputBorderHover: themes.dark.inputBorderHover,
          alertInfoBorder: themes.dark.alertInfoBorder,
          alertWarningBorder: themes.dark.alertWarningBorder,
          alertErrorBorder: themes.dark.alertErrorBorder,
          alertSuccessBorder: themes.dark.alertSuccessBorder,
          loaderPrimary: themes.dark.loaderPrimary,
          loaderSecondary: themes.dark.loaderSecondary
        },
        queued: {
          main: colors.gray40
        }
      }
    }
  },
  components: {
    MuiTableRow: {
      styleOverrides: {
        root: {
          '&.MuiTableRow-hover:hover': {
            backgroundColor: dynamicTheme('palette.background.primaryHover')
          }
        }
      }
    },
    MuiAlert: {
      styleOverrides: {
        outlinedError: {
          backgroundColor: dynamicTheme('palette.background.alertDanger'),
          borderColor: dynamicTheme('palette.custom.alertErrorBorder'),
          boxShadow: 'none'
        },
        outlinedInfo: {
          backgroundColor: dynamicTheme('palette.background.alertInfo'),
          borderColor: dynamicTheme('palette.custom.alertInfoBorder'),
          boxShadow: 'none'
        },
        outlinedWarning: {
          backgroundColor: dynamicTheme('palette.background.alertWarning'),
          borderColor: dynamicTheme('palette.custom.alertWarningBorder'),
          boxShadow: 'none'
        },
        outlinedSuccess: {
          backgroundColor: dynamicTheme('palette.background.alertSuccess'),
          borderColor: dynamicTheme('palette.custom.alertSuccessBorder'),
          boxShadow: 'none'
        }
      }
    },
    MuiAlertTitle: {
      styleOverrides: {
        root: {
          color: 'inherit'
        }
      }
    },
    MuiAvatar: {
      styleOverrides: {
        circular: {
          width: 40,
          height: 40
        },
        root: {
          backgroundColor: dynamicTheme('palette.background.item'),
          color: dynamicTheme('palette.text.tertiary')
        }
      }
    },
    MuiButtonBase: {
      defaultProps: {
        disableRipple: true
      }
    },
    MuiButton: {
      variants: [
        {
          props: { size: 'small' },
          style: {
            fontSize: '14px'
          }
        }
      ],
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontSize: 14
        },
        containedError: {
          backgroundColor: '#D92D20'
        },
        containedPrimary: {
          backgroundColor: dynamicTheme('palette.voxel.500'),
          color: '#FFFFFF',
          '&:hover': {
            backgroundColor: dynamicTheme('palette.voxel.600')
          }
        },
        outlined: {
          borderColor: dynamicTheme('palette.text.secondary'),
          color: dynamicTheme('palette.text.secondary')
        }
      }
    },
    MuiChip: {
      styleOverrides: {
        root: {
          backgroundColor: dynamicTheme('palette.background.item'),
          color: dynamicTheme('palette.text.secondary'),
          fontSize: 13
        }
      }
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: dynamicTheme('palette.background.input'),
          '&:hover': {
            borderColor: dynamicTheme('palette.custom.inputBorderHover')
          },
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: dynamicTheme('palette.custom.inputBorderHover')
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: dynamicTheme('palette.custom.inputBorderHover')
          }
        },
        notchedOutline: {
          borderColor: dynamicTheme('palette.custom.inputBorder')
        }
      }
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'unset',
          boxShadow: dynamicTheme('voxelShadows.sm')
        }
      }
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          width: 220
        },
        list: {
          paddingTop: 0,
          paddingBottom: 0
        }
      }
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          paddingTop: '0.75rem !important',
          paddingBottom: '0.75rem !important'
        }
      }
    },
    MuiDivider: {
      styleOverrides: {
        root: {
          margin: '0 !important'
        }
      }
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          fontSize: 12
        }
      }
    },
    MuiTextField: {
      styleOverrides: {
        root: ({ ownerState, theme }) => {
          const { mode } = theme.palette;
          const conditionalStyles = {};
          if (ownerState.disabled && mode === 'dark') {
            conditionalStyles['& fieldset'] = {
              border: 'none'
            };
          }
          return {
            ...conditionalStyles
          };
        }
      }
    },
    MuiListSubheader: {
      styleOverrides: {
        root: {
          backgroundColor: 'unset'
        }
      }
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 3,
          '&.Mui-selected': {
            backgroundColor: dynamicTheme('palette.background.primary'),
            boxShadow: dynamicTheme('voxelShadows.sm'),
            '&:hover': {
              backgroundColor: dynamicTheme('palette.background.secondaryHover')
            }
          },
          '&.Mui-selected span': {
            color: dynamicTheme('palette.text.primary')
          }
        }
      }
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderColor: dynamicTheme('palette.divider')
        }
      }
    },
    MuiTab: { styleOverrides: { root: { fontSize: 14 } } },
    MuiSwitch: {
      styleOverrides: {
        colorPrimary: {
          '&.Mui-checked': {
            color: dynamicTheme('palette.voxel.500')
          }
        },
        track: {
          '.Mui-checked.Mui-checked + &': {
            backgroundColor: dynamicTheme('palette.voxel.500')
          }
        }
      }
    }
  },
  voxelShadows: {
    sm: `0px 2px 3px ${dynamicTheme('palette.custom.shadow')}`,
    leftSm: `-2px 1px 3px ${dynamicTheme('palette.custom.shadowDark')}`
  },
  shadows: [
    'none',
    '0px 12px 16px -4px rgba(16, 24, 40, 0.08), 0px 4px 6px -2px rgba(16, 24, 40, 0.03)',
    '0px 1px 2px 0px #1018280D',
    '-2px -1px 8px -3px rgba(26,26,26,0.85)',
    'none',
    'none',
    'none',
    'none',
    'none',
    'none',
    'none',
    'none',
    'none',
    'none',
    'none',
    'none',
    'none',
    'none',
    'none',
    'none',
    'none',
    'none',
    'none',
    'none',
    'none'
  ]
});

// You can use your own `deepmerge` function.
// muiTheme will deeply merge to joyTheme.
const theme = deepmerge(joyTheme, muiTheme);

export default function ThemeProvider({ children }) {
  return (
    <CssVarsProvider theme={theme} defaultMode="dark">
      {children}
    </CssVarsProvider>
  );
}
