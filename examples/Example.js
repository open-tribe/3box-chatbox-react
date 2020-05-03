import React from 'react';
import Box from '3box';
import SVG from 'react-inlinesvg';

import ChatBox from '../src/index';
import Logo from '../src/assets/3BoxLogoWhite.svg';

import './index.scss';

class Example extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      // box: {},
      myProfile: {},
      myAddress: window.ethereum.selectedAddress,
      isReady: false,
    }
  }

  componentDidMount() {
    // this.handleLogin();
  }

  handleLogin = async () => {
    const addresses = await window.ethereum.enable();
    const myAddress = addresses[0];

    const box = await Box.openBox(myAddress, window.ethereum, {});
    const myProfile = await Box.getProfile(myAddress);

    box.onSyncDone(() => this.setState({ box }));
    this.setState({ box, myProfile, myAddress, isReady: true });
  }

  // disable the `open` option in <ChatRoom> to test this onError callback,
  // and set `members` to members={[myAddress]}
  onError = (error, {
      currentUserAddr,
      addedMembers,
      members,
      addedModerators,
      moderators,
      firstModerator
    }, showError) => {
    if (error && error.message && error.message.includes('not a member of the thread')) {
      if (members && !members.includes(currentUserAddr)) {
        // user is not in the list of members
        return "You need to RSVP to get access";
      } else if (addedMembers && !addedMembers.includes(currentUserAddr)) {
        // moderators haven't added user to the chat
        return "Request pending to add you to the chat";
      }
    }
  }

  render() {
    const {
      box,
      myAddress,
      myProfile,
      isReady
    } = this.state;

    return (
      <div className="App">
        <div className="example_page">
          <div className="example_page_header">
            <SVG src={Logo} alt="Logo" className="example_page_header_logo" />
            <h2>Chatbox <br /> Demo</h2>
          </div>
          <div className="userscontainer">
            <ChatBox
              // required
              // spaceName='3boxtestcomments'
              // threadName='ghostChatTest5'
              spaceName='Kickback'
              threadName='chatbox'

              // case A & B
              box={box}
              currentUserAddr={myAddress}

              // case B
              loginFunction={this.handleLogin}

              // case C
              // ethereum={window.ethereum}

              // optional
              // mute
              openOnMount
              popupChat

              // persistent threads
              persistent
              open
              firstModerator={"0x72c419022d04F8975F2d4E2eFB42Fec2fFC5b97E"}
              // moderators={["0xp83F..."]}
              // members={["0xp83F...", "0xu9i7..."]}
              // members={[myAddress]}

            // colorTheme="#1168df"
            // threadOpts={{}}
            // spaceOpts={{}}
            // useHovers={true}
            // currentUser3BoxProfile={myProfile}
            // userProfileURL={(address) => `https://userprofiles.co/user/${address}`}

              onError={this.onError}
            />
          </div>
        </div>
      </div>
    );
  }
}

export default Example;
